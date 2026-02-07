// ============================================================================
// SVG Parser - Parse SVG to identify nodes/edges
//
// beautiful-mermaid SVGs have no IDs on nodes. This parser identifies nodes
// by their shape elements and associates them with text labels.
// ============================================================================

import type {
  BoundingBox,
  DiagramType,
  ParsedEdge,
  ParsedNode,
  Point,
  SvgNodeType,
  SvgParseContext,
  EdgeConnection,
} from '../types.ts'

/**
 * SVG Parser - identifies draggable nodes and edges in rendered mermaid SVGs
 */
export class SvgParser {
  private nodeCounter = 0
  private edgeCounter = 0

  /**
   * Parse SVG and identify draggable nodes and edges.
   */
  parse(svg: SVGSVGElement): { nodes: ParsedNode[]; edges: ParsedEdge[]; diagramType: DiagramType } {
    const diagramType = this.detectDiagramType(svg)
    const nodes = this.parseNodes(svg, diagramType)
    const edges = this.parseEdges(svg, nodes, diagramType)

    return { nodes, edges, diagramType }
  }

  /**
   * Detect the diagram type from SVG structure
   */
  private detectDiagramType(svg: SVGSVGElement): DiagramType {
    // Sequence diagrams have actors with specific structure
    if (svg.querySelector('path[d*="M21 12C21"]')) {
      return 'sequence'
    }

    // Class diagrams have member text with visibility symbols
    const monoText = Array.from(svg.querySelectorAll('text.mono'))
    if (monoText.some(t => /[\+#/~]/.test(t.textContent || ''))) {
      return 'class'
    }

    // ER diagrams have attribute text with key badges
    if (svg.querySelector('rect[fill="var(--_key-badge)"]')) {
      return 'er'
    }

    // State diagrams have state-start/state-end pseudostates
    if (
      svg.querySelector('circle[fill="var(--_text)"]') ||
      svg.querySelector('circle[fill="none"][stroke*="var(--_text)"]')
    ) {
      return 'state'
    }

    // Default to flowchart
    return 'flowchart'
  }

  /**
   * Parse nodes from the SVG based on diagram type
   */
  private parseNodes(svg: SVGSVGElement, diagramType: DiagramType): ParsedNode[] {
    const nodes: ParsedNode[] = []
    const processedIds = new Set<string>()

    switch (diagramType) {
      case 'sequence':
        return this.parseSequenceNodes(svg)
      case 'class':
        return this.parseClassNodes(svg)
      case 'er':
        return this.parseErNodes(svg)
      case 'state':
        return this.parseStateNodes(svg)
      case 'flowchart':
      default:
        return this.parseFlowchartNodes(svg)
    }
  }

  /**
   * Parse flowchart nodes (rectangles, circles, polygons, etc.)
   */
  private parseFlowchartNodes(svg: SVGSVGElement): ParsedNode[] {
    const nodes: ParsedNode[] = []
    const textElements = Array.from(svg.querySelectorAll('text'))
    const shapes = Array.from(
      svg.querySelectorAll('rect, circle, polygon, ellipse, line, path')
    )

    // Filter out shapes that are part of markers, edges, or other non-node elements
    const candidateShapes = shapes.filter(shape => {
      // Skip elements in defs
      if (shape.closest('defs')) return false

      // Skip marker polygons
      if (shape.tagName === 'polygon' && shape.closest('marker')) return false

      // Skip lines (they're edges)
      if (shape.tagName === 'line') return false

      // Skip paths that are part of actor icons in sequence diagrams
      if (shape.tagName === 'path') {
        const d = shape.getAttribute('d')
        if (d && d.includes('M21 12C21')) return false
      }

      // For rectangles, skip small ones that are likely backgrounds/labels
      if (shape.tagName === 'rect') {
        const width = parseFloat(shape.getAttribute('width') || '0')
        const height = parseFloat(shape.getAttribute('height') || '0')
        // Skip very small rectangles (key badges, label backgrounds)
        if (width < 15 || height < 15) return false
      }

      // For circles, skip tiny ones (marker parts, bullet points)
      if (shape.tagName === 'circle') {
        const r = parseFloat(shape.getAttribute('r') || '0')
        if (r < 5) return false
      }

      return true
    })

    // Group shapes by proximity to create composite nodes
    const shapeGroups = this.groupShapesByProximity(candidateShapes, textElements)

    for (const group of shapeGroups) {
      const node = this.createNodeFromShapeGroup(group, textElements)
      if (node) {
        nodes.push(node)
      }
    }

    return nodes
  }

  /**
   * Group shapes that belong to the same node (e.g., cylinder body + ellipses)
   */
  private groupShapesByProximity(
    shapes: SVGElement[],
    textElements: SVGTextElement[]
  ): SVGElement[][] {
    const groups: SVGElement[][] = []
    const used = new Set<SVGElement>()

    for (const shape of shapes) {
      if (used.has(shape)) continue

      const bbox = this.getBBox(shape)
      const group = [shape]
      used.add(shape)

      // Find nearby shapes that might belong to the same node
      for (const other of shapes) {
        if (used.has(other)) continue

        const otherBbox = this.getBBox(other)
        const distance = Math.sqrt(
          Math.pow(bbox.x - otherBbox.x, 2) + Math.pow(bbox.y - otherBbox.y, 2)
        )

        // If shapes are very close, they're probably part of the same node
        if (distance < Math.max(bbox.width, bbox.height) * 0.5) {
          group.push(other)
          used.add(other)
        }
      }

      groups.push(group)
    }

    return groups
  }

  /**
   * Create a parsed node from a group of shapes
   */
  private createNodeFromShapeGroup(
    shapes: SVGElement[],
    textElements: SVGTextElement[]
  ): ParsedNode | null {
    if (shapes.length === 0) return null

    // Calculate combined bounding box
    let combinedBbox: BoundingBox | null = null
    for (const shape of shapes) {
      const bbox = this.getBBox(shape)
      if (!combinedBbox) {
        combinedBbox = { ...bbox }
      } else {
        combinedBbox.x = Math.min(combinedBbox.x, bbox.x)
        combinedBbox.y = Math.min(combinedBbox.y, bbox.y)
        combinedBbox.width = Math.max(
          combinedBbox.x + combinedBbox.width,
          bbox.x + bbox.width
        ) - combinedBbox.x
        combinedBbox.height = Math.max(
          combinedBbox.y + combinedBbox.height,
          bbox.y + bbox.height
        ) - combinedBbox.y
      }
    }

    if (!combinedBbox) return null

    // Find the primary shape for type detection
    const primaryShape = this.findPrimaryShape(shapes)

    // Detect node type
    const type = this.detectNodeType(primaryShape, shapes)

    // Find associated label
    const label = this.findLabelForShapes(shapes, combinedBbox, textElements)

    // Generate stable ID
    const id = this.generateNodeId(combinedBbox, label)

    return {
      id,
      elements: shapes as SVGElement[],
      x: combinedBbox.x,
      y: combinedBbox.y,
      width: combinedBbox.width,
      height: combinedBbox.height,
      type,
      label,
      originalX: combinedBbox.x,
      originalY: combinedBbox.y,
    }
  }

  /**
   * Find the primary shape from a group (the largest one)
   */
  private findPrimaryShape(shapes: SVGElement[]): SVGElement {
    let largest = shapes[0]!
    let largestArea = 0

    for (const shape of shapes) {
      const bbox = this.getBBox(shape)
      const area = bbox.width * bbox.height
      if (area > largestArea) {
        largest = shape
        largestArea = area
      }
    }

    return largest
  }

  /**
   * Detect node type from shape element(s)
   */
  private detectNodeType(shape: SVGElement, allShapes: SVGElement[]): SvgNodeType {
    const tagName = shape.tagName

    if (tagName === 'circle') {
      // Check for double circle (state pseudostate)
      if (allShapes.length > 1) {
        return 'doublecircle'
      }
      return 'circle'
    }

    if (tagName === 'ellipse') {
      return 'ellipse'
    }

    if (tagName === 'polygon') {
      return 'polygon'
    }

    if (tagName === 'rect') {
      const rx = parseFloat(shape.getAttribute('rx') || '0')
      const ry = parseFloat(shape.getAttribute('ry') || '0')

      if (rx > 0 && ry > 0) {
        if (rx >= ry) {
          return 'stadium' // Fully rounded sides
        }
        return 'rounded'
      }
      return 'rect'
    }

    return 'unknown'
  }

  /**
   * Find the text label for a node
   */
  private findLabelForShapes(
    shapes: SVGElement[],
    bbox: BoundingBox,
    textElements: SVGTextElement[]
  ): string | undefined {
    // Find text elements within or near the node's bounding box
    const centerX = bbox.x + bbox.width / 2
    const centerY = bbox.y + bbox.height / 2
    const padding = 10

    let closestText: SVGTextElement | null = null
    let closestDistance = Infinity

    for (const text of textElements) {
      const textBbox = this.getBBox(text)
      const textCenterX = textBbox.x + textBbox.width / 2
      const textCenterY = textBbox.y + textBbox.height / 2

      // Check if text is within the node's bounding box (with padding)
      const isContained =
        textCenterX >= bbox.x - padding &&
        textCenterX <= bbox.x + bbox.width + padding &&
        textCenterY >= bbox.y - padding &&
        textCenterY <= bbox.y + bbox.height + padding

      if (isContained) {
        const distance = Math.sqrt(
          Math.pow(centerX - textCenterX, 2) + Math.pow(centerY - textCenterY, 2)
        )
        if (distance < closestDistance) {
          closestText = text
          closestDistance = distance
        }
      }
    }

    return closestText?.textContent?.trim() || undefined
  }

  /**
   * Parse sequence diagram nodes (actors/participants)
   */
  private parseSequenceNodes(svg: SVGSVGElement): ParsedNode[] {
    const nodes: ParsedNode[] = []
    const actorGroups = svg.querySelectorAll('g')

    for (const group of actorGroups) {
      // Check if this group contains an actor icon (the circle-person icon)
      const hasActorIcon = group.querySelector('path[d*="M21 12C21"]')
      if (hasActorIcon) {
        const label = this.findSequenceActorLabel(svg, group)
        const bbox = this.getGroupBBox(group)

        if (bbox.width > 0) {
          nodes.push({
            id: this.generateNodeId(bbox, label),
            elements: Array.from(group.children) as SVGElement[],
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
            type: 'circle',
            label,
            originalX: bbox.x,
            originalY: bbox.y,
          })
        }
        continue
      }

      // Check for participant rectangles
      const rect = group.querySelector('rect')
      if (rect && !group.querySelector('marker')) {
        const bbox = this.getBBox(rect)
        const width = parseFloat(rect.getAttribute('width') || '0')
        const height = parseFloat(rect.getAttribute('height') || '0')

        if (width > 20 && height > 20) {
          const text = group.querySelector('text')
          const label = text?.textContent?.trim()

          nodes.push({
            id: this.generateNodeId(bbox, label),
            elements: [rect as SVGElement],
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
            type: 'rounded',
            label,
            originalX: bbox.x,
            originalY: bbox.y,
          })
        }
      }
    }

    return nodes
  }

  /**
   * Find actor label in sequence diagrams (below the icon)
   */
  private findSequenceActorLabel(svg: SVGSVGElement, group: Element): string | undefined {
    const bbox = this.getGroupBBox(group)
    const centerX = bbox.x + bbox.width / 2

    // Look for text below the actor icon
    const texts = Array.from(svg.querySelectorAll('text'))
    for (const text of texts) {
      const textBbox = this.getBBox(text)
      const textCenterX = textBbox.x + textBbox.width / 2

      // Text should be centered horizontally and below the actor
      if (Math.abs(textCenterX - centerX) < 5 && textBbox.y > bbox.y + bbox.height) {
        if (textBbox.y < bbox.y + bbox.height + 30) {
          return text.textContent?.trim()
        }
      }
    }

    return undefined
  }

  /**
   * Parse class diagram nodes
   */
  private parseClassNodes(svg: SVGSVGElement): ParsedNode[] {
    const nodes: ParsedNode[] = []
    const textElements = Array.from(svg.querySelectorAll('text.mono'))

    // Find all rectangles that could be class boxes
    const rects = Array.from(svg.querySelectorAll('rect'))

    for (const rect of rects) {
      const bbox = this.getBBox(rect)
      const width = parseFloat(rect.getAttribute('width') || '0')
      const height = parseFloat(rect.getAttribute('height') || '0')

      // Skip small rectangles (likely not class boxes)
      if (width < 50 || height < 30) continue

      // Skip rectangles in defs
      if (rect.closest('defs')) continue

      // Check if this rect has mono text nearby (class members)
      const hasNearbyMono = textElements.some(text => {
        const textBbox = this.getBBox(text)
        return (
          textBbox.x > bbox.x &&
          textBbox.x < bbox.x + width &&
          textBbox.y > bbox.y &&
          textBbox.y < bbox.y + height
        )
      })

      if (hasNearbyMono) {
        // Find class name (first text element in the box)
        const allTexts = Array.from(svg.querySelectorAll('text'))
        let label: string | undefined

        for (const text of allTexts) {
          const textBbox = this.getBBox(text)
          if (
            textBbox.x > bbox.x &&
            textBbox.x < bbox.x + width &&
            textBbox.y > bbox.y &&
            textBbox.y < bbox.y + height / 2
          ) {
            const content = text.textContent?.trim()
            // Skip annotation text
            if (content && !content.startsWith('<<')) {
              label = content
              break
            }
          }
        }

        nodes.push({
          id: this.generateNodeId(bbox, label),
          elements: [rect as SVGElement],
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
          type: 'rect',
          label,
          originalX: bbox.x,
          originalY: bbox.y,
        })
      }
    }

    return nodes
  }

  /**
   * Parse ER diagram nodes (entities)
   */
  private parseErNodes(svg: SVGSVGElement): ParsedNode[] {
    const nodes: ParsedNode[] = []

    // Find entity rectangles (larger ones with headers)
    const rects = Array.from(svg.querySelectorAll('rect'))

    for (const rect of rects) {
      const bbox = this.getBBox(rect)
      const width = parseFloat(rect.getAttribute('width') || '0')
      const height = parseFloat(rect.getAttribute('height') || '0')

      // Skip small rectangles
      if (width < 60 || height < 40) continue

      // Check if this has the header background fill
      const fill = rect.getAttribute('fill')
      if (fill?.includes('group-hdr')) continue // Skip header rects themselves

      // Look for a nearby text that could be the entity name
      const texts = Array.from(svg.querySelectorAll('text'))
      let label: string | undefined

      for (const text of texts) {
        const textBbox = this.getBBox(text)
        if (
          Math.abs(textBbox.x - (bbox.x + width / 2)) < width / 2 &&
          textBbox.y > bbox.y &&
          textBbox.y < bbox.y + 40
        ) {
          label = text.textContent?.trim()
          break
        }
      }

      nodes.push({
        id: this.generateNodeId(bbox, label),
        elements: [rect as SVGElement],
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        type: 'rect',
        label,
        originalX: bbox.x,
        originalY: bbox.y,
      })
    }

    return nodes
  }

  /**
   * Parse state diagram nodes
   */
  private parseStateNodes(svg: SVGSVGElement): ParsedNode[] {
    const nodes: ParsedNode[] = []

    // Find all shapes (rectangles and circles)
    const shapes = Array.from(svg.querySelectorAll('rect, circle'))

    for (const shape of shapes) {
      const bbox = this.getBBox(shape)

      // Skip small circles that might be markers
      if (shape.tagName === 'circle') {
        const r = parseFloat(shape.getAttribute('r') || '0')
        if (r < 8) continue
      }

      // Skip small rectangles
      if (shape.tagName === 'rect') {
        const width = parseFloat(shape.getAttribute('width') || '0')
        const height = parseFloat(shape.getAttribute('height') || '0')
        if (width < 30 || height < 20) continue
      }

      // Skip defs elements
      if (shape.closest('defs')) continue

      const type = shape.tagName === 'circle' ? 'circle' : 'rounded'
      const label = this.findStateLabel(svg, bbox)

      nodes.push({
        id: this.generateNodeId(bbox, label),
        elements: [shape as SVGElement],
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        type,
        label,
        originalX: bbox.x,
        originalY: bbox.y,
      })
    }

    return nodes
  }

  /**
   * Find label for a state node
   */
  private findStateLabel(svg: SVGSVGElement, bbox: BoundingBox): string | undefined {
    const centerX = bbox.x + bbox.width / 2
    const centerY = bbox.y + bbox.height / 2

    const texts = Array.from(svg.querySelectorAll('text'))
    for (const text of texts) {
      const textBbox = this.getBBox(text)
      const textCenterX = textBbox.x + textBbox.width / 2
      const textCenterY = textBbox.y + textBbox.height / 2

      if (
        Math.abs(textCenterX - centerX) < 10 &&
        Math.abs(textCenterY - centerY) < 10
      ) {
        return text.textContent?.trim()
      }
    }

    return undefined
  }

  /**
   * Parse edges from the SVG
   */
  private parseEdges(
    svg: SVGSVGElement,
    nodes: ParsedNode[],
    diagramType: DiagramType
  ): ParsedEdge[] {
    const edges: ParsedEdge[] = []

    // Find all polylines and lines
    const polylines = Array.from(svg.querySelectorAll('polyline'))
    const lines = Array.from(svg.querySelectorAll('line'))

    // Filter out non-edge lines
    const edgePolylines = polylines.filter(pl => {
      // Skip polylines in defs
      if (pl.closest('defs')) return false
      // Skip polylines in markers
      if (pl.closest('marker')) return false
      return true
    })

    const edgeLines = lines.filter(l => {
      // Skip lines in defs
      if (l.closest('defs')) return false
      // Skip lines in markers
      if (l.closest('marker')) return false
      // Skip dashed lifelines in sequence diagrams
      const strokeDasharray = l.getAttribute('stroke-dasharray')
      if (strokeDasharray?.includes('6 4')) return false
      return true
    })

    // Process polylines
    for (const pl of edgePolylines) {
      const points = this.parsePolylinePoints(pl)
      if (points.length >= 2) {
        const edge = this.createEdgeFromPolyline(pl, points, nodes)
        if (edge) edges.push(edge)
      }
    }

    // Process lines
    for (const line of edgeLines) {
      const points = this.parseLinePoints(line)
      const edge = this.createEdgeFromLine(line, points, nodes)
      if (edge) edges.push(edge)
    }

    return edges
  }

  /**
   * Parse points from a polyline element
   */
  private parsePolylinePoints(polyline: SVGPolylineElement): Point[] {
    const pointsAttr = polyline.getAttribute('points')
    if (!pointsAttr) return []

    const points: Point[] = []
    const coords = pointsAttr.trim().split(/\s+/)

    for (const coord of coords) {
      const [x, y] = coord.split(',').map(Number)
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y })
      }
    }

    return points
  }

  /**
   * Parse points from a line element
   */
  private parseLinePoints(line: SVGLineElement): Point[] {
    const x1 = parseFloat(line.getAttribute('x1') || '0')
    const y1 = parseFloat(line.getAttribute('y1') || '0')
    const x2 = parseFloat(line.getAttribute('x2') || '0')
    const y2 = parseFloat(line.getAttribute('y2') || '0')

    return [{ x: x1, y: y1 }, { x: x2, y: y2 }]
  }

  /**
   * Create a parsed edge from a polyline
   */
  private createEdgeFromPolyline(
    polyline: SVGPolylineElement,
    points: Point[],
    nodes: ParsedNode[]
  ): ParsedEdge | null {
    const firstPoint = points[0]!
    const lastPoint = points[points.length - 1]!

    // Find connected nodes
    const sourceNodeId = this.findNodeAtPoint(firstPoint, nodes)
    const targetNodeId = this.findNodeAtPoint(lastPoint, nodes)

    // Find associated label elements
    const labelElement = this.findEdgeLabel(polyline, points)
    const labelBackground = this.findEdgeLabelBackground(labelElement)

    // Calculate label offset if label was found
    let labelOffset: Point | undefined
    if (labelElement) {
      const midPoint = this.calculateEdgeMidpoint(points)
      const labelBbox = this.getBBox(labelElement)
      const labelCenter = {
        x: labelBbox.x + labelBbox.width / 2,
        y: labelBbox.y + labelBbox.height / 2
      }
      labelOffset = {
        x: labelCenter.x - midPoint.x,
        y: labelCenter.y - midPoint.y
      }
    }

    return {
      id: `edge-${this.edgeCounter++}`,
      element: polyline,
      points,
      sourceNodeId,
      targetNodeId,
      labelElement,
      labelBackground,
      labelOffset,
    }
  }

  /**
   * Create a parsed edge from a line
   */
  private createEdgeFromLine(
    line: SVGLineElement,
    points: Point[],
    nodes: ParsedNode[]
  ): ParsedEdge | null {
    const firstPoint = points[0]!
    const lastPoint = points[points.length - 1]!

    const sourceNodeId = this.findNodeAtPoint(firstPoint, nodes)
    const targetNodeId = this.findNodeAtPoint(lastPoint, nodes)

    // Find associated label elements
    const labelElement = this.findEdgeLabel(line, points)
    const labelBackground = this.findEdgeLabelBackground(labelElement)

    // Calculate label offset if label was found
    let labelOffset: Point | undefined
    if (labelElement) {
      const midPoint = this.calculateEdgeMidpoint(points)
      const labelBbox = this.getBBox(labelElement)
      const labelCenter = {
        x: labelBbox.x + labelBbox.width / 2,
        y: labelBbox.y + labelBbox.height / 2
      }
      labelOffset = {
        x: labelCenter.x - midPoint.x,
        y: labelCenter.y - midPoint.y
      }
    }

    return {
      id: `edge-${this.edgeCounter++}`,
      element: line,
      points,
      sourceNodeId,
      targetNodeId,
      labelElement,
      labelBackground,
      labelOffset,
    }
  }

  /**
   * Find which node is at a given point
   * Uses a dynamic threshold based on node size for more reliable edge-to-node connection detection
   */
  private findNodeAtPoint(point: Point, nodes: ParsedNode[]): string | undefined {
    // Sort nodes by distance to point (closest first)
    const sortedNodes = [...nodes].sort((a, b) => {
      const distA = Math.sqrt(
        Math.pow(point.x - (a.x + a.width / 2), 2) +
        Math.pow(point.y - (a.y + a.height / 2), 2)
      )
      const distB = Math.sqrt(
        Math.pow(point.x - (b.x + b.width / 2), 2) +
        Math.pow(point.y - (b.y + b.height / 2), 2)
      )
      return distA - distB
    })

    for (const node of sortedNodes) {
      const nodeCenter = {
        x: node.x + node.width / 2,
        y: node.y + node.height / 2,
      }

      // Dynamic threshold based on node size
      const maxDim = Math.max(node.width, node.height)
      const threshold = maxDim * 0.4 // 40% of max dimension

      const distance = Math.sqrt(
        Math.pow(point.x - nodeCenter.x, 2) + Math.pow(point.y - nodeCenter.y, 2)
      )

      // Check if point is within node bounds + threshold
      if (distance < maxDim / 2 + threshold) {
        return node.id
      }
    }

    return undefined
  }

  /**
   * Find edges connected to a node
   */
  findConnectedEdges(node: ParsedNode, edges: ParsedEdge[]): EdgeConnection[] {
    const connections: EdgeConnection[] = []

    for (const edge of edges) {
      if (edge.sourceNodeId === node.id) {
        connections.push({
          edge,
          endpoint: 'source',
          point: edge.points[0]!,
          offset: this.calculateEdgeOffset(edge.points[0]!, node),
        })
      }

      if (edge.targetNodeId === node.id) {
        connections.push({
          edge,
          endpoint: 'target',
          point: edge.points[edge.points.length - 1]!,
          offset: this.calculateEdgeOffset(
            edge.points[edge.points.length - 1]!,
            node
          ),
        })
      }
    }

    return connections
  }

  /**
   * Calculate the offset of an edge endpoint from the node center
   */
  private calculateEdgeOffset(point: Point, node: ParsedNode): Point {
    const nodeCenter = {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
    }

    return {
      x: point.x - nodeCenter.x,
      y: point.y - nodeCenter.y,
    }
  }

  /**
   * Generate a stable ID for a node based on position and label
   */
  private generateNodeId(bbox: BoundingBox, label?: string): string {
    // Round position to nearest pixel for stability
    const x = Math.round(bbox.x)
    const y = Math.round(bbox.y)

    // Create a hash from position and label
    const hash = this.simpleHash(`${x},${y},${label || ''}`)

    return `node-${hash}`
  }

  /**
   * Simple hash function for generating stable IDs
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Get bounding box of an element
   */
  private getBBox(element: SVGElement): BoundingBox {
    try {
      const bbox = element.getBBox()
      return {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
      }
    } catch {
      // Fallback for elements not in DOM
      return { x: 0, y: 0, width: 0, height: 0 }
    }
  }

  /**
   * Get bounding box of a group
   */
  private getGroupBBox(group: Element): BoundingBox {
    try {
      const svgElement = group as unknown as SVGGraphicsElement
      const bbox = svgElement.getBBox()
      return {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
      }
    } catch {
      return { x: 0, y: 0, width: 0, height: 0 }
    }
  }

  /**
   * Find the label element associated with an edge.
   * Labels are typically rendered after edges and positioned near the edge midpoint.
   */
  private findEdgeLabel(
    edgeElement: SVGPolylineElement | SVGLineElement,
    points: Point[]
  ): SVGTextElement | undefined {
    const svg = edgeElement.closest('svg') as SVGSVGElement
    if (!svg) return undefined

    // Calculate edge midpoint
    const midPoint = this.calculateEdgeMidpoint(points)

    // Find text elements near the midpoint
    const texts = Array.from(svg.querySelectorAll('text'))
    const threshold = 30 // px search radius

    for (const text of texts) {
      const bbox = this.getBBox(text)
      const textCenter = {
        x: bbox.x + bbox.width / 2,
        y: bbox.y + bbox.height / 2
      }

      const distance = Math.sqrt(
        Math.pow(textCenter.x - midPoint.x, 2) +
        Math.pow(textCenter.y - midPoint.y, 2)
      )

      if (distance < threshold) {
        // Verify it's an edge label (smaller font, muted color)
        const fontSize = parseFloat(text.getAttribute('font-size') || '12')
        if (fontSize < 14) { // Edge labels typically use smaller font
          return text as SVGTextElement
        }
      }
    }

    return undefined
  }

  /**
   * Find the background rectangle for an edge label.
   * Flowcharts and ER diagrams have background pills behind labels.
   */
  private findEdgeLabelBackground(
    labelElement?: SVGTextElement
  ): SVGRectElement | undefined {
    if (!labelElement) return undefined

    const svg = labelElement.closest('svg') as SVGSVGElement
    if (!svg) return undefined

    const labelBbox = this.getBBox(labelElement)

    // Find a rect that overlaps significantly with the label
    const rects = Array.from(svg.querySelectorAll('rect'))

    for (const rect of rects) {
      const rectBbox = this.getBBox(rect)

      // Check for significant overlap (label should be inside/near bg rect)
      const overlapX = Math.max(0,
        Math.min(labelBbox.x + labelBbox.width, rectBbox.x + rectBbox.width) -
        Math.max(labelBbox.x, rectBbox.x)
      )
      const overlapY = Math.max(0,
        Math.min(labelBbox.y + labelBbox.height, rectBbox.y + rectBbox.height) -
        Math.max(labelBbox.y, rectBbox.y)
      )

      if (overlapX > 5 && overlapY > 5) {
        return rect as SVGRectElement
      }
    }

    return undefined
  }

  /**
   * Calculate the arc-length midpoint of an edge.
   * This finds the true midpoint along the path length, not just the average of points.
   */
  calculateEdgeMidpoint(points: Point[]): Point {
    if (points.length === 0) return { x: 0, y: 0 }
    if (points.length === 1) return points[0]!

    // Calculate arc-length midpoint
    let totalLength = 0
    for (let i = 1; i < points.length; i++) {
      const dx = points[i]!.x - points[i - 1]!.x
      const dy = points[i]!.y - points[i - 1]!.y
      totalLength += Math.sqrt(dx * dx + dy * dy)
    }

    const halfLength = totalLength / 2
    let walked = 0

    for (let i = 1; i < points.length; i++) {
      const dx = points[i]!.x - points[i - 1]!.x
      const dy = points[i]!.y - points[i - 1]!.y
      const segLen = Math.sqrt(dx * dx + dy * dy)

      if (walked + segLen >= halfLength) {
        const t = segLen > 0 ? (halfLength - walked) / segLen : 0
        return {
          x: points[i - 1]!.x + dx * t,
          y: points[i - 1]!.y + dy * t
        }
      }
      walked += segLen
    }

    return points[points.length - 1]!
  }
}

// Singleton instance
let parserInstance: SvgParser | null = null

export function getSvgParser(): SvgParser {
  if (!parserInstance) {
    parserInstance = new SvgParser()
  }
  return parserInstance
}

// ============================================================================
// Drag Handler - DOM event handling for drag-and-drop
// ============================================================================

import type {
  InteractiveOptions,
  DragState,
  ParsedNode,
  ParsedEdge,
  Point,
  EdgeConnection,
} from '../types.ts'
import { NodeTracker } from './node-tracker.ts'
import { getSvgParser } from './svg-parser.ts'

/**
 * Handles drag events for interactive diagrams
 */
export class DragHandler {
  private tracker: NodeTracker
  private container: HTMLElement | SVGElement
  private options: InteractiveOptions
  private svg: SVGSVGElement

  private activeNode: ParsedNode | null = null
  private dragOffset = { x: 0, y: 0 }
  private isDragging = false
  private source = ''

  // Event listener bindings for cleanup
  private boundMouseDown: ((e: Event) => void) | null = null
  private boundMouseMove: ((e: Event) => void) | null = null
  private boundMouseUp: ((e: Event) => void) | null = null
  private boundTouchStart: ((e: Event) => void) | null = null
  private boundTouchMove: ((e: Event) => void) | null = null
  private boundTouchEnd: ((e: Event) => void) | null = null

  constructor(
    container: HTMLElement | SVGElement,
    nodes: ParsedNode[],
    edges: ParsedEdge[],
    options: InteractiveOptions,
    source: string
  ) {
    this.container = container
    this.options = { ...options }
    this.source = source

    // Get the SVG element
    this.svg = this.getSvgElement(container)

    // Create tracker
    this.tracker = new NodeTracker(nodes, edges)
  }

  /**
   * Enable drag functionality
   */
  enable(): void {
    const nodes = this.tracker.getAllNodes()
    const draggableClass = this.options.draggableClass || 'mermaid-draggable'

    for (const node of nodes) {
      for (const element of node.elements) {
        // Add draggable class
        element.classList.add(draggableClass)

        // Set cursor style
        const cursor = this.options.hoverCursor || 'grab'
        element.style.cursor = cursor

        // Store reference to node ID on the element
        element.setAttribute('data-mermaid-node-id', node.id)
      }
    }

    // Set up event delegation
    this.boundMouseDown = this.handleMouseDown.bind(this)
    this.boundMouseMove = this.handleMouseMove.bind(this)
    this.boundMouseUp = this.handleMouseUp.bind(this)

    if (this.options.touchEnabled !== false) {
      this.boundTouchStart = this.handleTouchStart.bind(this)
      this.boundTouchMove = this.handleTouchMove.bind(this)
      this.boundTouchEnd = this.handleTouchEnd.bind(this)
    }

    // Add event listeners to the container (delegation)
    this.container.addEventListener('mousedown', this.boundMouseDown)
    document.addEventListener('mousemove', this.boundMouseMove)
    document.addEventListener('mouseup', this.boundMouseUp)

    if (this.boundTouchStart) {
      this.container.addEventListener('touchstart', this.boundTouchStart, { passive: false })
      document.addEventListener('touchmove', this.boundTouchMove, { passive: false })
      document.addEventListener('touchend', this.boundTouchEnd)
    }
  }

  /**
   * Disable drag functionality
   */
  disable(): void {
    const nodes = this.tracker.getAllNodes()
    const draggableClass = this.options.draggableClass || 'mermaid-draggable'

    for (const node of nodes) {
      for (const element of node.elements) {
        element.classList.remove(draggableClass)
        element.style.cursor = ''
        element.removeAttribute('data-mermaid-node-id')
      }
    }

    // Remove event listeners
    if (this.boundMouseDown) {
      this.container.removeEventListener('mousedown', this.boundMouseDown)
      document.removeEventListener('mousemove', this.boundMouseMove)
      document.removeEventListener('mouseup', this.boundMouseUp)
    }

    if (this.boundTouchStart) {
      this.container.removeEventListener('touchstart', this.boundTouchStart)
      document.removeEventListener('touchmove', this.boundTouchMove)
      document.removeEventListener('touchend', this.boundTouchEnd)
    }

    this.boundMouseDown = null
    this.boundMouseMove = null
    this.boundMouseUp = null
    this.boundTouchStart = null
    this.boundTouchMove = null
    this.boundTouchEnd = null
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    this.disable()
  }

  /**
   * Get the tracker instance
   */
  getTracker(): NodeTracker {
    return this.tracker
  }

  /**
   * Handle mouse down event
   */
  private handleMouseDown(event: Event): void {
    if (this.options.disabled) return

    const mouseEvent = event as MouseEvent
    const target = mouseEvent.target as SVGElement

    // Find the node element
    const nodeElement = target.closest('[data-mermaid-node-id]') as SVGElement | null
    if (!nodeElement) return

    const nodeId = nodeElement.getAttribute('data-mermaid-node-id')
    if (!nodeId) return

    const node = this.tracker.getNode(nodeId)
    if (!node) return

    event.preventDefault()
    this.startDrag(node, mouseEvent.clientX, mouseEvent.clientY)
  }

  /**
   * Handle touch start event
   */
  private handleTouchStart(event: Event): void {
    if (this.options.disabled) return

    const touchEvent = event as TouchEvent
    const target = touchEvent.target as SVGElement

    // Find the node element
    const nodeElement = target.closest('[data-mermaid-node-id]') as SVGElement | null
    if (!nodeElement) return

    const nodeId = nodeElement.getAttribute('data-mermaid-node-id')
    if (!nodeId) return

    const node = this.tracker.getNode(nodeId)
    if (!node) return

    // Prevent default to avoid page scrolling while dragging
    touchEvent.preventDefault()

    const touch = touchEvent.touches[0]
    if (touch) {
      this.startDrag(node, touch.clientX, touch.clientY)
    }
  }

  /**
   * Start dragging a node
   */
  private startDrag(node: ParsedNode, clientX: number, clientY: number): void {
    this.activeNode = node
    this.isDragging = true

    // Calculate offset from node position
    this.dragOffset = {
      x: clientX - node.x,
      y: clientY - node.y,
    }

    // Add dragging class
    const draggingClass = this.options.draggingClass || 'mermaid-dragging'
    for (const element of node.elements) {
      element.classList.add(draggingClass)
      // Change cursor
      const cursor = this.options.cursor || 'grabbing'
      element.style.cursor = cursor
    }

    // Update document cursor
    if (this.container instanceof HTMLElement) {
      this.container.style.cursor = this.options.cursor || 'grabbing'
    }

    // Call drag start callback
    this.options.onDragStart?.(node.id)
  }

  /**
   * Handle mouse move event
   */
  private handleMouseMove(event: Event): void {
    if (!this.activeNode || !this.isDragging) return

    const mouseEvent = event as MouseEvent
    this.updateDrag(mouseEvent.clientX, mouseEvent.clientY)
  }

  /**
   * Handle touch move event
   */
  private handleTouchMove(event: Event): void {
    if (!this.activeNode || !this.isDragging) return

    const touchEvent = event as TouchEvent

    // Prevent default to avoid page scrolling while dragging
    touchEvent.preventDefault()

    const touch = touchEvent.touches[0]
    if (touch) {
      this.updateDrag(touch.clientX, touch.clientY)
    }
  }

  /**
   * Update drag position
   */
  private updateDrag(clientX: number, clientY: number): void {
    if (!this.activeNode) return

    let newX = clientX - this.dragOffset.x
    let newY = clientY - this.dragOffset.y

    // Apply grid snapping if enabled
    if (this.options.gridSize && this.options.gridSize > 0) {
      newX = Math.round(newX / this.options.gridSize) * this.options.gridSize
      newY = Math.round(newY / this.options.gridSize) * this.options.gridSize
    }

    // Get SVG to screen coordinate transformation
    const pt = this.svg.createSVGPoint()
    pt.x = newX
    pt.y = newY
    const svgPt = pt.matrixTransform(this.svg.getScreenCTM()?.inverse() || new DOMMatrix())

    // Update node position
    this.tracker.updateNodePosition(this.activeNode.id, svgPt.x, svgPt.y)

    // Apply transform to node elements
    this.tracker.applyPositionUpdates()

    // Update connected edges
    this.updateConnectedEdges(this.activeNode)

    // Call drag move callback
    this.options.onDragMove?.(this.getCurrentState())
  }

  /**
   * Handle mouse up event
   */
  private handleMouseUp(_event: Event): void {
    this.endDrag()
  }

  /**
   * Handle touch end event
   */
  private handleTouchEnd(_event: Event): void {
    this.endDrag()
  }

  /**
   * End dragging
   */
  private endDrag(): void {
    if (!this.activeNode) return

    // Remove dragging class
    const draggingClass = this.options.draggingClass || 'mermaid-dragging'
    const hoverCursor = this.options.hoverCursor || 'grab'

    for (const element of this.activeNode.elements) {
      element.classList.remove(draggingClass)
      element.style.cursor = hoverCursor
    }

    // Reset document cursor
    if (this.container instanceof HTMLElement) {
      this.container.style.cursor = ''
    }

    // Save positions if auto-save is enabled
    if (this.options.autoSave !== false) {
      // This will be handled by the main instance
    }

    // Call drag end callback
    this.options.onDragEnd?.(this.getCurrentState())

    this.activeNode = null
    this.isDragging = false
  }

  /**
   * Update edges connected to a node
   */
  private updateConnectedEdges(node: ParsedNode): void {
    const parser = getSvgParser()
    const edges = this.tracker.getAllEdges()
    const connections = parser.findConnectedEdges(node, edges)

    for (const conn of connections) {
      this.updateEdge(conn, node)
    }
  }

  /**
   * Update a single edge endpoint
   */
  private updateEdge(connection: EdgeConnection, node: ParsedNode): void {
    const { edge, endpoint, offset } = connection

    // Calculate new point position based on node center and offset
    const nodeCenter = {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
    }

    const newPoint = {
      x: nodeCenter.x + offset.x,
      y: nodeCenter.y + offset.y,
    }

    // Update the edge points
    if (endpoint === 'source') {
      edge.points[0] = newPoint
    } else {
      edge.points[edge.points.length - 1] = newPoint
    }

    // Update the DOM element
    this.updateEdgeElement(edge)
  }

  /**
   * Update the edge's DOM element with new points
   */
  private updateEdgeElement(edge: ParsedEdge): void {
    const element = edge.element

    if (element.tagName === 'polyline') {
      const pointsStr = edge.points.map(p => `${p.x},${p.y}`).join(' ')
      element.setAttribute('points', pointsStr)
    } else if (element.tagName === 'line') {
      if (edge.points.length >= 2) {
        element.setAttribute('x1', String(edge.points[0]!.x))
        element.setAttribute('y1', String(edge.points[0]!.y))
        element.setAttribute('x2', String(edge.points[edge.points.length - 1]!.x))
        element.setAttribute('y2', String(edge.points[edge.points.length - 1]!.y))
      }
    }
  }

  /**
   * Get current drag state
   */
  private getCurrentState(): DragState {
    return {
      positions: this.tracker.getAllPositions(),
      source: this.source,
      activeNodeId: this.activeNode?.id,
    }
  }

  /**
   * Get the SVG element from the container
   */
  private getSvgElement(container: HTMLElement | SVGElement): SVGSVGElement {
    if (container.tagName === 'svg') {
      return container as SVGSVGElement
    }

    const svg = container.querySelector('svg')
    if (!svg) {
      throw new Error('No SVG element found in container')
    }

    return svg as SVGSVGElement
  }
}

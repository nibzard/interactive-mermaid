// ============================================================================
// Type definitions for interactive-mermaid
// ============================================================================

/**
 * Point in 2D space
 */
export interface Point {
  x: number
  y: number
}

/**
 * Bounding box of a node
 */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Node types that can be identified in the SVG
 */
export type SvgNodeType =
  | 'rect'
  | 'rounded'
  | 'diamond'
  | 'stadium'
  | 'circle'
  | 'subroutine'
  | 'doublecircle'
  | 'hexagon'
  | 'cylinder'
  | 'asymmetric'
  | 'trapezoid'
  | 'trapezoid-alt'
  | 'state-start'
  | 'state-end'
  | 'ellipse'
  | 'polygon'
  | 'line'
  | 'unknown'

/**
 * A parsed node from the SVG
 */
export interface ParsedNode {
  /** Generated unique ID (stable across re-renders) */
  id: string
  /** Reference to the DOM element(s) for this node */
  elements: SVGElement[]
  /** Current position */
  x: number
  y: number
  /** Dimensions */
  width: number
  height: number
  /** Node type */
  type: SvgNodeType
  /** Label text (if found) */
  label?: string
  /** Original position before drag */
  originalX: number
  originalY: number
}

/**
 * A parsed edge (connection between nodes)
 */
export interface ParsedEdge {
  /** Edge ID */
  id: string
  /** Reference to the polyline/line element */
  element: SVGPolylineElement | SVGLineElement
  /** All points in the edge path */
  points: Point[]
  /** Node IDs that this edge connects */
  sourceNodeId?: string
  targetNodeId?: string
  /** Label element (if present) */
  labelElement?: SVGTextElement
  /** Background rect for label (if present) */
  labelBackground?: SVGRectElement
}

/**
 * Diagram type detection
 */
export type DiagramType = 'flowchart' | 'sequence' | 'state' | 'class' | 'er' | 'unknown'

/**
 * Current drag state
 */
export interface DragState {
  /** Node ID -> position mapping */
  positions: Record<string, { x: number; y: number }>
  /** Original mermaid source */
  source: string
  /** Updated mermaid source with position hints (optional format) */
  updatedSource?: string
  /** The node currently being dragged (if any) */
  activeNodeId?: string
}

/**
 * Options for making a diagram interactive
 */
export interface InteractiveOptions {
  /**
   * Called when a drag operation completes.
   * Returns updated node positions that can be used to regenerate the diagram.
   */
  onDragEnd?: (state: DragState) => void

  /**
   * Called continuously during drag for live updates.
   */
  onDragMove?: (state: DragState) => void

  /**
   * Called when a drag operation starts.
   */
  onDragStart?: (nodeId: string) => void

  /**
   * Enable/disable drag functionality.
   * @default false
   */
  disabled?: boolean

  /**
   * CSS cursor style during drag.
   * @default 'grabbing'
   */
  cursor?: string

  /**
   * CSS cursor style when hovering over draggable nodes.
   * @default 'grab'
   */
  hoverCursor?: string

  /**
   * Snap to grid (px). Set to 0 to disable.
   * @default 0
   */
  gridSize?: number

  /**
   * Auto-save positions to localStorage.
   * @default true
   */
  autoSave?: boolean

  /**
   * Storage key prefix for localStorage.
   * @default 'mermaid-layout'
   */
  storageKeyPrefix?: string

  /**
   * Enable touch events for mobile.
   * @default true
   */
  touchEnabled?: boolean

  /**
   * Visual feedback during drag - add a class to the active node.
   * @default 'mermaid-dragging'
   */
  draggingClass?: string

  /**
   * Visual feedback for hoverable nodes.
   * @default 'mermaid-draggable'
   */
  draggableClass?: string
}

/**
 * Instance returned by makeInteractive with control methods
 */
export interface InteractiveMermaidInstance {
  /** Update the diagram with new mermaid source */
  update(source: string): void

  /** Set node positions programmatically */
  setPositions(positions: Record<string, { x: number; y: number }>): void

  /** Get current node positions */
  getPositions(): Record<string, { x: number; y: number }>

  /** Enable/disable interactivity */
  setEnabled(enabled: boolean): void

  /** Clean up event listeners */
  destroy(): void

  /** Get the parsed nodes */
  getNodes(): ParsedNode[]

  /** Get the parsed edges */
  getEdges(): ParsedEdge[]

  /** Reset all nodes to their original positions */
  resetPositions(): void
}

/**
 * Serialized layout data for persistence
 */
export interface SerializedLayout {
  version: number
  source: string
  positions: Record<string, { x: number; y: number }>
  timestamp: number
  diagramType?: DiagramType
}

/**
 * SVG parsing context
 */
export interface SvgParseContext {
  /** The SVG element being parsed */
  svg: SVGSVGElement
  /** Diagram type (if detectable) */
  diagramType: DiagramType
  /** Mapping of element IDs to parsed nodes */
  nodeMap: Map<string, ParsedNode>
  /** Mapping of element IDs to parsed edges */
  edgeMap: Map<string, ParsedEdge>
  /** Text elements for label lookup */
  textElements: SVGTextElement[]
}

/**
 * Edge connection info
 */
export interface EdgeConnection {
  /** The edge */
  edge: ParsedEdge
  /** Which endpoint connects to the node */
  endpoint: 'source' | 'target'
  /** Original point position */
  point: Point
  /** Offset from node center */
  offset: Point
}

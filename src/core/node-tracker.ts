// ============================================================================
// Node Tracker - Track node positions during drag operations
// ============================================================================

import type { ParsedNode, ParsedEdge, Point } from '../types.ts'

/**
 * Tracks node positions and provides position updates
 */
export class NodeTracker {
  private nodes: Map<string, ParsedNode>
  private originalPositions: Map<string, { x: number; y: number }>
  private edges: ParsedEdge[]

  constructor(nodes: ParsedNode[], edges: ParsedEdge[]) {
    this.nodes = new Map()
    this.originalPositions = new Map()
    this.edges = edges

    for (const node of nodes) {
      this.nodes.set(node.id, node)
      this.originalPositions.set(node.id, { x: node.originalX, y: node.originalY })
    }
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): ParsedNode | undefined {
    return this.nodes.get(id)
  }

  /**
   * Get all nodes
   */
  getAllNodes(): ParsedNode[] {
    return Array.from(this.nodes.values())
  }

  /**
   * Get all edges
   */
  getAllEdges(): ParsedEdge[] {
    return this.edges
  }

  /**
   * Update node position
   */
  updateNodePosition(id: string, x: number, y: number): boolean {
    const node = this.nodes.get(id)
    if (!node) return false

    node.x = x
    node.y = y
    return true
  }

  /**
   * Get current position of a node
   */
  getNodePosition(id: string): { x: number; y: number } | undefined {
    const node = this.nodes.get(id)
    if (!node) return undefined
    return { x: node.x, y: node.y }
  }

  /**
   * Get all current positions as a record
   */
  getAllPositions(): Record<string, { x: number; y: number }> {
    const positions: Record<string, { x: number; y: number }> = {}
    for (const [id, node] of this.nodes) {
      positions[id] = { x: node.x, y: node.y }
    }
    return positions
  }

  /**
   * Get all original positions
   */
  getOriginalPositions(): Record<string, { x: number; y: number }> {
    const positions: Record<string, { x: number; y: number }> = {}
    for (const [id, pos] of this.originalPositions) {
      positions[id] = { ...pos }
    }
    return positions
  }

  /**
   * Reset a node to its original position
   */
  resetNodePosition(id: string): boolean {
    const original = this.originalPositions.get(id)
    if (!original) return false

    return this.updateNodePosition(id, original.x, original.y)
  }

  /**
   * Reset all nodes to their original positions
   */
  resetAllPositions(): void {
    for (const [id, original] of this.originalPositions) {
      this.updateNodePosition(id, original.x, original.y)
    }
  }

  /**
   * Apply position updates to all node elements in the DOM
   */
  applyPositionUpdates(): void {
    for (const node of this.nodes.values()) {
      this.applyNodeTransform(node)
    }
  }

  /**
   * Apply transform to a node's elements
   */
  private applyNodeTransform(node: ParsedNode): void {
    const dx = node.x - node.originalX
    const dy = node.y - node.originalY

    // If no movement, clear any existing transform
    if (dx === 0 && dy === 0) {
      for (const element of node.elements) {
        if (element.getAttribute('data-original-transform')) {
          element.setAttribute('transform', element.getAttribute('data-original-transform') || '')
        } else {
          element.removeAttribute('transform')
        }
      }
      return
    }

    // Apply translation to each element
    for (const element of node.elements) {
      // Store original transform if not already stored
      if (!element.hasAttribute('data-original-transform')) {
        element.setAttribute('data-original-transform', element.getAttribute('transform') || '')
      }

      const originalTransform = element.getAttribute('data-original-transform') || ''
      const translate = `translate(${dx}, ${dy})`

      // Combine with existing transform
      if (originalTransform) {
        element.setAttribute('transform', `${originalTransform} ${translate}`)
      } else {
        element.setAttribute('transform', translate)
      }
    }
  }

  /**
   * Set positions from a record
   */
  setPositions(positions: Record<string, { x: number; y: number }>): void {
    for (const [id, pos] of Object.entries(positions)) {
      this.updateNodePosition(id, pos.x, pos.y)
    }
    this.applyPositionUpdates()
  }

  /**
   * Get the delta (movement) for a node
   */
  getNodeDelta(id: string): { dx: number; dy: number } | undefined {
    const node = this.nodes.get(id)
    if (!node) return undefined
    return {
      dx: node.x - node.originalX,
      dy: node.y - node.originalY,
    }
  }

  /**
   * Get connected edges for a node
   */
  getConnectedEdges(nodeId: string): ParsedEdge[] {
    return this.edges.filter(
      edge => edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId
    )
  }
}

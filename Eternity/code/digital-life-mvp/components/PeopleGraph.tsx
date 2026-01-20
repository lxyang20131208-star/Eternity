'use client'

import { useEffect, useRef, useState } from 'react'

interface Person {
  id: string
  name: string
  avatar_url?: string
  relationship_to_user?: string
  importance_score?: number
}

interface Relationship {
  id: string
  person_a_id: string
  person_b_id: string
  relationship_type: string
  custom_label?: string
  bidirectional: boolean
}

interface Node {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  person: Person
  isCenter?: boolean
}

interface PeopleGraphProps {
  people: Person[]
  relationships: Relationship[]
  onNodeClick: (person: Person) => void
  onAddRelationship?: (personAId: string, personBId: string) => void
}

export default function PeopleGraph({
  people,
  relationships,
  onNodeClick,
  onAddRelationship,
}: PeopleGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [draggedNode, setDraggedNode] = useState<string | null>(null)
  const animationRef = useRef<number>()

  const NODE_RADIUS = 40
  const CENTER_RADIUS = 60

  // 初始化节点位置（以"我"为中心的散射布局）
  useEffect(() => {
    if (people.length === 0) return

    const canvas = canvasRef.current
    if (!canvas) return

    const centerX = canvas.width / 2
    const centerY = canvas.height / 2

    // 创建中心节点（"我"）
    const centerNode: Node = {
      id: 'center',
      x: centerX,
      y: centerY,
      vx: 0,
      vy: 0,
      person: {
        id: 'center',
        name: '我',
        relationship_to_user: '',
      },
      isCenter: true,
    }

    // 计算散射半径和角度
    const radius = Math.min(canvas.width, canvas.height) * 0.3
    const angleStep = (Math.PI * 2) / people.length

    const personNodes: Node[] = people.map((person, index) => {
      const angle = angleStep * index
      return {
        id: person.id,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
        person,
      }
    })

    setNodes([centerNode, ...personNodes])
  }, [people])

  // 物理模拟（简单的力导向布局）
  useEffect(() => {
    if (nodes.length === 0) return

    const simulate = () => {
      setNodes((currentNodes) => {
        return currentNodes.map((node, i) => {
          if (node.isCenter || draggedNode === node.id) return node

          let fx = 0
          let fy = 0

          // 1. 中心吸引力
          const centerNode = currentNodes.find((n) => n.isCenter)
          if (centerNode) {
            const dx = centerNode.x - node.x
            const dy = centerNode.y - node.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            const targetDistance = Math.min(canvasRef.current!.width, canvasRef.current!.height) * 0.3
            const force = (distance - targetDistance) * 0.01
            fx += (dx / distance) * force
            fy += (dy / distance) * force
          }

          // 2. 节点排斥力
          currentNodes.forEach((otherNode, j) => {
            if (i === j) return
            const dx = node.x - otherNode.x
            const dy = node.y - otherNode.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            if (distance < 150 && distance > 0) {
              const force = 100 / (distance * distance)
              fx += (dx / distance) * force
              fy += (dy / distance) * force
            }
          })

          // 3. 关系连线吸引力
          relationships.forEach((rel) => {
            const otherNodeId =
              rel.person_a_id === node.id ? rel.person_b_id : rel.person_b_id === node.id ? rel.person_a_id : null
            if (!otherNodeId) return

            const otherNode = currentNodes.find((n) => n.id === otherNodeId)
            if (!otherNode) return

            const dx = otherNode.x - node.x
            const dy = otherNode.y - node.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            const targetDistance = 150
            const force = (distance - targetDistance) * 0.02
            fx += (dx / distance) * force
            fy += (dy / distance) * force
          })

          // 应用阻尼
          const newVx = (node.vx + fx) * 0.8
          const newVy = (node.vy + fy) * 0.8

          return {
            ...node,
            vx: newVx,
            vy: newVy,
            x: node.x + newVx,
            y: node.y + newVy,
          }
        })
      })

      animationRef.current = requestAnimationFrame(simulate)
    }

    animationRef.current = requestAnimationFrame(simulate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [nodes.length, relationships, draggedNode])

  // 绘制画布
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 绘制关系线
    relationships.forEach((rel) => {
      const nodeA = nodes.find((n) => n.id === rel.person_a_id || (n.isCenter && rel.person_a_id === 'center'))
      const nodeB = nodes.find((n) => n.id === rel.person_b_id || (n.isCenter && rel.person_b_id === 'center'))

      if (nodeA && nodeB) {
        ctx.beginPath()
        ctx.moveTo(nodeA.x, nodeA.y)
        ctx.lineTo(nodeB.x, nodeB.y)
        ctx.strokeStyle = '#cbd5e1'
        ctx.lineWidth = 2
        ctx.stroke()

        // 绘制关系标签
        const midX = (nodeA.x + nodeB.x) / 2
        const midY = (nodeA.y + nodeB.y) / 2
        ctx.fillStyle = '#64748b'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(rel.custom_label || rel.relationship_type, midX, midY)
      }
    })

    // 绘制从中心到每个人的连线
    const centerNode = nodes.find((n) => n.isCenter)
    if (centerNode) {
      nodes.forEach((node) => {
        if (node.isCenter) return

        // 检查是否已有关系线
        const hasRelationship = relationships.some(
          (rel) =>
            (rel.person_a_id === 'center' && rel.person_b_id === node.id) ||
            (rel.person_b_id === 'center' && rel.person_a_id === node.id)
        )

        if (!hasRelationship) {
          ctx.beginPath()
          ctx.moveTo(centerNode.x, centerNode.y)
          ctx.lineTo(node.x, node.y)
          ctx.strokeStyle = '#e2e8f0'
          ctx.lineWidth = 1
          ctx.setLineDash([5, 5])
          ctx.stroke()
          ctx.setLineDash([])

          // 绘制关系标签
          const midX = (centerNode.x + node.x) / 2
          const midY = (centerNode.y + node.y) / 2
          ctx.fillStyle = '#94a3b8'
          ctx.font = '11px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(node.person.relationship_to_user || '未知', midX, midY)
        }
      })
    }

    // 绘制节点
    nodes.forEach((node) => {
      const radius = node.isCenter ? CENTER_RADIUS : NODE_RADIUS
      const isSelected = selectedNodes.includes(node.id)

      // 绘制选中效果
      if (isSelected) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2)
        ctx.fillStyle = '#3b82f6'
        ctx.globalAlpha = 0.2
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // 绘制节点圆形
      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = node.isCenter ? '#8b5cf6' : '#6366f1'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3
      ctx.stroke()

      // 绘制头像或首字母
      if (node.person.avatar_url) {
        // TODO: 绘制头像图片
        // 这里需要预加载图片
      } else {
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${node.isCenter ? '24px' : '18px'} sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(node.person.name.charAt(0), node.x, node.y)
      }

      // 绘制姓名
      ctx.fillStyle = '#1f2937'
      ctx.font = `${node.isCenter ? '16px' : '14px'} sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(node.person.name, node.x, node.y + radius + 20)

      // 绘制提到次数（如果有）
      if (!node.isCenter && node.person.importance_score && node.person.importance_score > 0) {
        ctx.fillStyle = '#6b7280'
        ctx.font = '10px sans-serif'
        ctx.fillText(`${node.person.importance_score}次`, node.x, node.y + radius + 35)
      }
    })
  }, [nodes, relationships, selectedNodes])

  // 鼠标事件处理
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const clickedNode = nodes.find((node) => {
      const radius = node.isCenter ? CENTER_RADIUS : NODE_RADIUS
      const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2)
      return distance <= radius
    })

    if (clickedNode) {
      if (e.shiftKey && onAddRelationship) {
        // Shift + 点击：选择节点以创建关系
        if (selectedNodes.includes(clickedNode.id)) {
          setSelectedNodes(selectedNodes.filter((id) => id !== clickedNode.id))
        } else if (selectedNodes.length < 2) {
          setSelectedNodes([...selectedNodes, clickedNode.id])
        }

        // 如果选中了两个节点，创建关系
        if (selectedNodes.length === 1 && !selectedNodes.includes(clickedNode.id)) {
          onAddRelationship(selectedNodes[0], clickedNode.id)
          setSelectedNodes([])
        }
      } else {
        setIsDragging(true)
        setDraggedNode(clickedNode.id)
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !draggedNode) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === draggedNode ? { ...node, x, y, vx: 0, vy: 0 } : node
      )
    )
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDraggedNode(null)
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.shiftKey || isDragging) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const clickedNode = nodes.find((node) => {
      const radius = node.isCenter ? CENTER_RADIUS : NODE_RADIUS
      const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2)
      return distance <= radius
    })

    if (clickedNode && !clickedNode.isCenter) {
      onNodeClick(clickedNode.person)
    }
  }

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        width={1200}
        height={800}
        className="w-full h-full border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 cursor-pointer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
      />

      {/* 提示信息 */}
      <div className="absolute top-4 left-4 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg text-sm text-gray-700 dark:text-gray-300">
        <p>点击节点查看详情</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          按住 Shift + 点击两个节点可创建关系
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">拖拽节点可调整位置</p>
      </div>

      {/* 选中节点提示 */}
      {selectedNodes.length > 0 && (
        <div className="absolute top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg">
          已选中 {selectedNodes.length} 个节点
          {selectedNodes.length === 1 && <span className="ml-2">（再选一个创建关系）</span>}
          <button
            onClick={() => setSelectedNodes([])}
            className="ml-3 text-white/80 hover:text-white"
          >
            取消
          </button>
        </div>
      )}
    </div>
  )
}

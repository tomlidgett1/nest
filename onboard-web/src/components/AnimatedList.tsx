import React from 'react'
import { motion, AnimatePresence } from 'motion/react'

export function AnimatedList({
  children,
  className = '',
}: {
  children: React.ReactNode[]
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <AnimatePresence mode="popLayout">
        {React.Children.map(children, (child, i) => {
          if (!React.isValidElement(child)) return child
          return (
            <motion.div
              key={child.key || i}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              {child}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

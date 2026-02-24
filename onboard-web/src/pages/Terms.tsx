import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

const sections = [
  {
    title: '1. Acceptance of terms',
    body: ['By using Nest, you agree to these terms. If you do not agree, do not use the service.'],
  },
  {
    title: '2. Service description',
    body: [
      'Nest is an AI assistant available through iMessage. It connects to Gmail, Calendar, and Contacts to help complete tasks through natural conversation.',
    ],
  },
  {
    title: '3. Eligibility',
    body: ['You must be at least 13 years old and legally able to accept these terms.'],
  },
  {
    title: '4. Account responsibility',
    body: [
      'You are responsible for activity on your connected accounts and for protecting account access.',
    ],
  },
  {
    title: '5. AI-generated actions',
    body: [
      'Nest uses AI to interpret requests and perform actions. You are responsible for reviewing important actions and communications.',
    ],
  },
  {
    title: '6. Liability',
    body: [
      'The service is provided as-is. To the maximum extent allowed by law, Nest is not liable for indirect or consequential losses.',
    ],
  },
  {
    title: '7. Contact',
    body: ['For questions about these terms, contact tlidgett@icloud.com.'],
  },
]

export default function Terms() {
  return (
    <motion.div
      className="min-h-screen bg-[#FAFAFA] font-sans selection:bg-gray-200 pb-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <header className="sticky top-0 z-50 bg-[#FAFAFA]/80 backdrop-blur-md border-b border-gray-200/50">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/nest-logo.png" alt="Nest" className="h-8 w-8 rounded-[10px] shadow-sm" />
            <span className="text-lg font-semibold tracking-tight text-gray-900">Nest</span>
          </Link>
          <Link to="/" className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pt-12 md:pt-16 pb-12">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: 18 February 2026</p>

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{section.title}</h2>
              <div className="space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-gray-600 leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </motion.div>
  )
}

import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Mail, MessageCircle, Clock, ArrowLeft, Trash2 } from 'lucide-react'

export default function Support() {
  return (
    <motion.div
      className="min-h-[100dvh] bg-[#FAFAFA] font-sans flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <header className="shrink-0 z-50 bg-[#FAFAFA]/80 backdrop-blur-md border-b border-gray-200/40">
        <div className="mx-auto max-w-lg px-5 py-2.5 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <img src="/nest-logo.png" alt="Nest" className="h-8 w-8 rounded-[10px] shadow-sm" />
            <span className="text-lg font-semibold tracking-tight text-gray-900">Nest</span>
          </Link>
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 rounded-full border border-gray-200/80 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-5 pt-10">
        <motion.div
          className="w-full max-w-lg"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <h1 className="text-[24px] font-semibold tracking-tight text-gray-900">Support</h1>
          <p className="text-[14px] text-gray-400 mt-1">We're here to help.</p>

          <div className="mt-8 space-y-3">
            <a
              href="mailto:nest.chat@icloud.com"
              className="flex items-center gap-4 rounded-2xl bg-white border border-gray-200/60 shadow-sm px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#007AFF]/10">
                <Mail className="h-5 w-5 text-[#007AFF]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-gray-900">Email us</p>
                <p className="text-[13px] text-gray-400">nest.chat@icloud.com</p>
              </div>
            </a>

            <a
              href="sms:tlidgett@icloud.com&body=Hey%20Nest,%20I%20need%20help%20with..."
              className="flex items-center gap-4 rounded-2xl bg-white border border-gray-200/60 shadow-sm px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
                <MessageCircle className="h-5 w-5 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-gray-900">Message Nest</p>
                <p className="text-[13px] text-gray-400">Ask for help directly in iMessage</p>
              </div>
            </a>

            <div className="flex items-center gap-4 rounded-2xl bg-white border border-gray-200/60 shadow-sm px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
                <Clock className="h-5 w-5 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-gray-900">Response time</p>
                <p className="text-[13px] text-gray-400">We typically reply within a few hours</p>
              </div>
            </div>
          </div>

          <div className="mt-16 pt-6 border-t border-gray-200/60">
            <Link
              to="/delete-account"
              className="flex items-center gap-3 rounded-2xl bg-white border border-gray-200/60 shadow-sm px-5 py-4 hover:bg-red-50 transition-colors group"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 group-hover:bg-red-100 transition-colors">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-red-600">Delete account</p>
                <p className="text-[13px] text-gray-400">Permanently remove your account and all data</p>
              </div>
            </Link>
          </div>
        </motion.div>
      </main>
    </motion.div>
  )
}

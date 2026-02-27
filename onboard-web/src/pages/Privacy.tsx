import { Link } from 'react-router-dom'
import { motion } from 'motion/react'

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 }

export default function Privacy() {
  return (
    <motion.div
      className="min-h-screen bg-[#FAFAFA] font-sans selection:bg-gray-200 pb-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <header className="sticky top-0 z-50 bg-[#FAFAFA]/80 backdrop-blur-md border-b border-gray-200/50">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link to="/" aria-label="Back to home" className="flex items-center gap-3">
            <img src="/nest-logo.png" alt="Nest" className="h-8 w-8 rounded-[10px] shadow-sm" />
            <span className="text-lg font-semibold tracking-tight text-gray-900">Nest</span>
          </Link>
          <Link to="/" className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
            Back
          </Link>
        </div>
      </header>

      <motion.main
        className="mx-auto max-w-3xl px-6 pt-12 md:pt-16"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.1 }}
      >
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: 18 February 2026</p>

        <div className="space-y-10 text-gray-600 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Introduction</h2>
            <p className="mb-3">
              Nest ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our iMessage-based productivity assistant and associated web application (collectively, the "Service").
            </p>
            <p>
              By using the Service, you agree to the collection and use of information in accordance with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">2. Information We Collect</h2>
            <h3 className="font-medium text-gray-900 mb-2 mt-4">2.1 Account Information</h3>
            <p className="mb-4">
              When you sign up via Google OAuth, we receive your name, email address, and profile photo from Google. We store this information to identify your account and personalise your experience.
            </p>
            <h3 className="font-medium text-gray-900 mb-2 mt-4">2.2 Google Service Data</h3>
            <p className="mb-4">
              With your explicit consent, we access data from your connected Google services including Gmail, Google Calendar, and Google Contacts. This access is used solely to fulfil your requests (e.g., reading emails, scheduling meetings, drafting replies). We do not store the contents of your emails, calendar events, or contacts on our servers beyond what is necessary to process your immediate request.
            </p>
            <h3 className="font-medium text-gray-900 mb-2 mt-4">2.3 Conversation Data</h3>
            <p className="mb-4">
              Messages you send to Nest via iMessage are processed to understand and fulfil your requests. We may retain conversation history to improve response quality and maintain context within your sessions.
            </p>
            <h3 className="font-medium text-gray-900 mb-2 mt-4">2.4 Authentication Tokens</h3>
            <p className="mb-4">
              We securely store OAuth refresh tokens to maintain access to your connected Google accounts. These tokens are encrypted at rest and are never shared with third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
            <p className="mb-3">We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Provide, operate, and maintain the Service</li>
              <li>Process and fulfil your requests (e.g., sending emails, managing calendar events)</li>
              <li>Personalise your experience and improve the Service</li>
              <li>Communicate with you about your account or the Service</li>
              <li>Detect, prevent, and address technical issues or abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Data Sharing and Disclosure</h2>
            <p className="mb-3">
              We do not sell, trade, or rent your personal information to third parties. We may share information only in the following circumstances:
            </p>
            <ul className="list-disc pl-5 space-y-3">
              <li><strong className="text-gray-900">Service Providers:</strong> We use trusted third-party services (such as Supabase for authentication and database hosting, and OpenAI for natural language processing) that may process your data on our behalf, subject to strict confidentiality obligations.</li>
              <li><strong className="text-gray-900">Legal Requirements:</strong> We may disclose your information if required to do so by law or in response to valid requests by public authorities.</li>
              <li><strong className="text-gray-900">Safety:</strong> We may disclose information to protect the rights, property, or safety of Nest, our users, or the public.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your data, including encryption in transit (TLS) and at rest, secure token storage, and row-level security policies on our database. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Data Retention</h2>
            <p>
              We retain your account information and conversation history for as long as your account is active. You may request deletion of your account and associated data at any time by contacting us. Upon deletion, we will remove your data within 30 days, except where retention is required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Your Rights</h2>
            <p className="mb-3">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-2 mb-3">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Withdraw consent for data processing</li>
              <li>Export your data in a portable format</li>
            </ul>
            <p>
              To exercise any of these rights, please contact us at the email address below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Google API Services</h2>
            <p>
              Nest's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google API Services User Data Policy</a>, including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Children's Privacy</h2>
            <p>
              The Service is not intended for use by anyone under the age of 13. We do not knowingly collect personal information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">11. Contact Us</h2>
            <p className="mb-2">
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <p><strong className="text-gray-900 font-medium">nest.chat@icloud.com</strong></p>
          </section>
        </div>
      </motion.main>
    </motion.div>
  )
}

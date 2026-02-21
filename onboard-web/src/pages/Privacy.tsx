import { Link } from 'react-router-dom'
import { motion } from 'motion/react'

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 }

export default function Privacy() {
  return (
    <motion.div
      className="page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <header className="top-bar">
        <Link to="/" aria-label="Back to home">
          <img src="/nest-logo.png" alt="Nest" className="top-bar-logo" />
        </Link>
        <div style={{ width: 34 }} />
      </header>

      <motion.main
        className="legal-page"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.1 }}
      >
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: 18 February 2026</p>

        <section>
          <h2>1. Introduction</h2>
          <p>
            Nest ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our iMessage-based productivity assistant and associated web application (collectively, the "Service").
          </p>
          <p>
            By using the Service, you agree to the collection and use of information in accordance with this policy.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          <h3>2.1 Account Information</h3>
          <p>
            When you sign up via Google OAuth, we receive your name, email address, and profile photo from Google. We store this information to identify your account and personalise your experience.
          </p>
          <h3>2.2 Google Service Data</h3>
          <p>
            With your explicit consent, we access data from your connected Google services including Gmail, Google Calendar, and Google Contacts. This access is used solely to fulfil your requests (e.g., reading emails, scheduling meetings, drafting replies). We do not store the contents of your emails, calendar events, or contacts on our servers beyond what is necessary to process your immediate request.
          </p>
          <h3>2.3 Conversation Data</h3>
          <p>
            Messages you send to Nest via iMessage are processed to understand and fulfil your requests. We may retain conversation history to improve response quality and maintain context within your sessions.
          </p>
          <h3>2.4 Authentication Tokens</h3>
          <p>
            We securely store OAuth refresh tokens to maintain access to your connected Google accounts. These tokens are encrypted at rest and are never shared with third parties.
          </p>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, operate, and maintain the Service</li>
            <li>Process and fulfil your requests (e.g., sending emails, managing calendar events)</li>
            <li>Personalise your experience and improve the Service</li>
            <li>Communicate with you about your account or the Service</li>
            <li>Detect, prevent, and address technical issues or abuse</li>
          </ul>
        </section>

        <section>
          <h2>4. Data Sharing and Disclosure</h2>
          <p>
            We do not sell, trade, or rent your personal information to third parties. We may share information only in the following circumstances:
          </p>
          <ul>
            <li><strong>Service Providers:</strong> We use trusted third-party services (such as Supabase for authentication and database hosting, and OpenAI for natural language processing) that may process your data on our behalf, subject to strict confidentiality obligations.</li>
            <li><strong>Legal Requirements:</strong> We may disclose your information if required to do so by law or in response to valid requests by public authorities.</li>
            <li><strong>Safety:</strong> We may disclose information to protect the rights, property, or safety of Nest, our users, or the public.</li>
          </ul>
        </section>

        <section>
          <h2>5. Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your data, including encryption in transit (TLS) and at rest, secure token storage, and row-level security policies on our database. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2>6. Data Retention</h2>
          <p>
            We retain your account information and conversation history for as long as your account is active. You may request deletion of your account and associated data at any time by contacting us. Upon deletion, we will remove your data within 30 days, except where retention is required by law.
          </p>
        </section>

        <section>
          <h2>7. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul>
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
          <h2>8. Google API Services</h2>
          <p>
            Nest's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.
          </p>
        </section>

        <section>
          <h2>9. Children's Privacy</h2>
          <p>
            The Service is not intended for use by anyone under the age of 13. We do not knowingly collect personal information from children under 13.
          </p>
        </section>

        <section>
          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date.
          </p>
        </section>

        <section>
          <h2>11. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at:
          </p>
          <p><strong>nestchatapp123@gmail.com</strong></p>
        </section>
      </motion.main>
    </motion.div>
  )
}

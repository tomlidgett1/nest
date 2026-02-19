import { Link } from 'react-router-dom'
import { motion } from 'motion/react'

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 }

export default function Terms() {
  return (
    <motion.div
      className="page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="top-bar">
        <Link to="/">
          <img src="/nest-logo.png" alt="Nest" className="top-bar-logo" />
        </Link>
        <div style={{ width: 34 }} />
      </div>

      <motion.div
        className="legal-page"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.1 }}
      >
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: 18 February 2026</p>

        <section>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using Nest (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Service.
          </p>
        </section>

        <section>
          <h2>2. Description of Service</h2>
          <p>
            Nest is an AI-powered productivity assistant accessible via iMessage. The Service connects to your Google account (Gmail, Calendar, Contacts) to help you manage emails, schedule meetings, and handle tasks through natural conversation.
          </p>
        </section>

        <section>
          <h2>3. Eligibility</h2>
          <p>
            You must be at least 13 years of age to use the Service. By using the Service, you represent and warrant that you meet this requirement and have the legal capacity to enter into these Terms.
          </p>
        </section>

        <section>
          <h2>4. Account Registration</h2>
          <p>
            To use the Service, you must authenticate with a Google account. You are responsible for maintaining the security of your account and for all activities that occur under your account. You agree to notify us immediately of any unauthorised use.
          </p>
        </section>

        <section>
          <h2>5. Permitted Use</h2>
          <p>You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to:</p>
          <ul>
            <li>Use the Service for any illegal or unauthorised purpose</li>
            <li>Attempt to gain unauthorised access to any part of the Service</li>
            <li>Interfere with or disrupt the Service or its infrastructure</li>
            <li>Use the Service to send spam, phishing messages, or other unsolicited communications</li>
            <li>Reverse-engineer, decompile, or disassemble any part of the Service</li>
            <li>Use the Service in a manner that could damage, disable, or impair the Service</li>
          </ul>
        </section>

        <section>
          <h2>6. Google Account Access</h2>
          <p>
            By connecting your Google account, you grant Nest permission to access and interact with your Gmail, Google Calendar, and Google Contacts on your behalf, solely to fulfil your requests. You may revoke this access at any time through your Google account settings or by removing your account from Nest.
          </p>
        </section>

        <section>
          <h2>7. AI-Generated Actions</h2>
          <p>
            Nest uses artificial intelligence to interpret your requests and take actions on your behalf (such as sending emails or scheduling events). While we strive for accuracy, AI-generated actions may occasionally be incorrect or incomplete. You acknowledge that:
          </p>
          <ul>
            <li>You are responsible for reviewing actions taken by Nest on your behalf</li>
            <li>Nest is not liable for any consequences arising from AI-generated actions</li>
            <li>You should verify important communications before they are sent</li>
          </ul>
        </section>

        <section>
          <h2>8. Intellectual Property</h2>
          <p>
            The Service, including its design, features, and content, is owned by Nest and is protected by intellectual property laws. You are granted a limited, non-exclusive, non-transferable licence to use the Service for personal, non-commercial purposes.
          </p>
        </section>

        <section>
          <h2>9. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Nest and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of data, revenue, or business opportunities, arising from your use of the Service.
          </p>
          <p>
            The Service is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
          </p>
        </section>

        <section>
          <h2>10. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless Nest and its operators from any claims, damages, losses, or expenses (including legal fees) arising from your use of the Service or violation of these Terms.
          </p>
        </section>

        <section>
          <h2>11. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service at any time, with or without cause, with or without notice. Upon termination, your right to use the Service will immediately cease. You may also terminate your account at any time by contacting us.
          </p>
        </section>

        <section>
          <h2>12. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. We will notify you of material changes by posting the updated Terms on this page. Your continued use of the Service after changes are posted constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2>13. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of Australia, without regard to its conflict of law provisions.
          </p>
        </section>

        <section>
          <h2>14. Contact Us</h2>
          <p>
            If you have any questions about these Terms, please contact us at:
          </p>
          <p><strong>tomlidgettprojects@gmail.com</strong></p>
        </section>
      </motion.div>
    </motion.div>
  )
}

import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 }

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

      <motion.main
        className="mx-auto max-w-3xl px-6 pt-12 md:pt-16 pb-12"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.1 }}
      >
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: 26 February 2026</p>

        <div className="space-y-10 text-gray-600 leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
            <p className="mb-3">
              These Terms of Service ("Terms") constitute a legally binding agreement between you ("User", "you", "your") and Nest ("we", "our", "us") governing your access to and use of the Nest AI assistant, associated web applications, APIs, and all related services (collectively, the "Service").
            </p>
            <p className="mb-3">
              By accessing or using the Service — including by sending a message to Nest via Apple iMessage, authenticating with Google OAuth, or visiting our website — you acknowledge that you have read, understood, and agree to be bound by these Terms, our <Link to="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>, and any additional policies referenced herein.
            </p>
            <p>
              If you do not agree to these Terms in their entirety, you must not access or use the Service. We reserve the right to modify these Terms at any time. Material changes will be communicated via the Service or email at least thirty (30) days before they take effect. Your continued use of the Service after such notice constitutes acceptance of the revised Terms.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Service Description</h2>
            <p className="mb-3">
              Nest is an AI-powered personal assistant delivered primarily through Apple iMessage. The Service enables you to manage email, calendar, contacts, and other productivity tasks through natural-language conversation. Core capabilities include:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-3">
              <li>Reading, drafting, and sending emails via connected Gmail accounts</li>
              <li>Creating, modifying, and querying Google Calendar events</li>
              <li>Searching and managing Google Contacts</li>
              <li>Providing AI-generated summaries, suggestions, and task automation</li>
              <li>Delivering account-related notifications and transactional updates via iMessage</li>
            </ul>
            <p>
              The Service operates as a messaging service provider ("MSP") within the Apple Messages for Business ecosystem and complies with Apple's Messages for Business policies, including Appendix A requirements. The Service also operates in accordance with Infobip's Application-to-Person (A2P) messaging compliance framework where applicable.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Eligibility</h2>
            <p className="mb-3">
              To use the Service, you must: (a) be at least eighteen (18) years of age, or the age of majority in your jurisdiction, whichever is greater; (b) have the legal capacity to enter into a binding agreement; (c) not be a person barred from receiving the Service under the laws of Australia or any other applicable jurisdiction; and (d) not use the Service for any purpose that violates applicable law or these Terms.
            </p>
            <p>
              If you are using the Service on behalf of an organisation, you represent and warrant that you have the authority to bind that organisation to these Terms, and "you" and "your" shall refer to both you individually and the organisation.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Account Registration and Security</h2>
            <p className="mb-3">
              To access the Service, you must authenticate via Google OAuth and provide accurate, complete, and current information. You agree to:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-3">
              <li>Maintain the confidentiality of your account credentials and connected service tokens</li>
              <li>Immediately notify us of any unauthorised access to or use of your account</li>
              <li>Not share your account or allow others to access the Service through your credentials</li>
              <li>Ensure that all information associated with your account remains accurate and up to date</li>
            </ul>
            <p>
              You are solely responsible for all activity that occurs under your account, whether or not authorised by you. We are not liable for any loss or damage arising from your failure to maintain the security of your account.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Messaging Consent and Communications</h2>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">5.1 Opt-In Consent</h3>
            <p className="mb-3">
              By initiating a conversation with Nest via iMessage, you expressly consent to receive messages from the Service, including transactional notifications, account status updates, and service-related communications. This consent is obtained in compliance with Apple Messages for Business opt-in requirements and Infobip A2P messaging consent frameworks.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">5.2 Notification Preferences</h3>
            <p className="mb-3">
              We may send you important notifications related to your account status or transactions. You can manage your message preferences at any time by sending "Unsubscribe" within the iMessage conversation. We honour the following standard trigger words in accordance with Apple Messages for Business policies:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-3">
              <li><strong className="text-gray-900">"Unsubscribe"</strong> (or "stop", "end", "spam") — opt out of non-essential notifications</li>
              <li><strong className="text-gray-900">"Subscribe"</strong> — opt in to marketing or promotional updates (only sent with your express permission)</li>
              <li><strong className="text-gray-900">"Menu"</strong> (or "list", "?") — view available commands and options</li>
              <li><strong className="text-gray-900">"Agent"</strong> (or "support", "help") — request assistance from a human support representative</li>
            </ul>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">5.3 No Unsolicited Marketing</h3>
            <p className="mb-3">
              We will never send unsolicited marketing, promotional offers, or product advertisements unless you have expressly opted in by sending "Subscribe". You may revoke this consent at any time.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">5.4 Deleted Conversations</h3>
            <p>
              If you delete a conversation with Nest, we will not send further messages to that conversation thread unless you re-initiate contact. This is in compliance with Apple Messages for Business conversation deletion policies.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">6. AI-Generated Actions and Content</h2>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">6.1 Nature of AI Output</h3>
            <p className="mb-3">
              The Service uses artificial intelligence and large language models to interpret your requests, generate responses, and perform actions on your behalf. AI-generated output may include drafted emails, calendar events, summaries, and suggested responses. All AI output is generated algorithmically and may contain errors, inaccuracies, or unintended content.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">6.2 User Responsibility</h3>
            <p className="mb-3">
              You are solely responsible for reviewing, verifying, and approving all AI-generated actions before they are executed — particularly actions that involve sending communications to third parties, modifying calendar events, or accessing sensitive information. Nest acts as a tool under your direction; the final decision to execute any action rests with you.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">6.3 No Professional Advice</h3>
            <p>
              The Service does not provide legal, financial, medical, or other professional advice. AI-generated content should not be relied upon as a substitute for professional consultation. You acknowledge that any reliance on AI output is at your own risk.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Human Support and Live Agent Access</h2>
            <p>
              In accordance with Apple Messages for Business requirements, Nest provides access to human support representatives during regular business hours (Monday–Friday, 9:00 AM – 5:00 PM AEST, excluding public holidays). You may request human assistance at any time by sending "Agent", "Support", or "Help" within the iMessage conversation. We do not operate as a bot-only solution and are committed to ensuring that human support is available when needed.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Third-Party Integrations and Google API Services</h2>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">8.1 Google API Compliance</h3>
            <p className="mb-3">
              Nest's use and transfer of information received from Google APIs adheres to the{' '}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google API Services User Data Policy</a>, including the Limited Use requirements. We access Google services (Gmail, Calendar, Contacts) only with your explicit OAuth consent and solely to fulfil your requests.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">8.2 Apple Messages for Business Compliance</h3>
            <p className="mb-3">
              The Service operates within the Apple Messages for Business ecosystem and complies with Apple's{' '}
              <a href="https://register.apple.com/resources/messages/messaging-documentation/policies" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Messages for Business Policies</a>{' '}
              and the{' '}
              <a href="https://register.apple.com/tou/bca/latest/en" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Service Terms for Messages for Business</a>. This includes adherence to policies regarding message content, opt-in/opt-out mechanisms, personal information handling, and live agent availability.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">8.3 Infobip A2P Messaging Compliance</h3>
            <p className="mb-3">
              Where the Service utilises Infobip as a messaging service provider, we comply with Infobip's{' '}
              <a href="https://www.infobip.com/docs/essentials/compliance-guidelines" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">compliance guidelines</a>,{' '}
              <a href="https://www.infobip.com/policies/service-terms-conditions" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Service Terms and Conditions</a>, and{' '}
              <a href="https://www.infobip.com/policies/service-use-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Service Use Policy</a>. This includes adherence to A2P messaging best practices, sender registration requirements, and content compliance standards.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">8.4 Third-Party Terms</h3>
            <p>
              Your use of third-party services accessed through Nest (including Google, Apple, and Infobip) is subject to the respective terms and policies of those providers. We are not responsible for the practices or policies of third-party services.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Personal Information and Data Handling</h2>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">9.1 Collection of Personal Information</h3>
            <p className="mb-3">
              In the course of providing the Service, we may need to collect personal information (such as your name, email address, or calendar details) to fulfil your requests. In compliance with Apple Messages for Business policies, we will only request personally identifiable information (PII) when it is necessary to address your specific enquiry or to establish your account.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">9.2 Consent Before Collection</h3>
            <p className="mb-3">
              Before requesting sensitive personal information, we will present a clarifying question to confirm that the information is relevant to your enquiry. You are never obligated to provide personal information and may decline any such request.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">9.3 Privacy Policy</h3>
            <p>
              All data collection, use, storage, and disclosure practices are governed by our <Link to="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>, which is incorporated into these Terms by reference. Our Privacy Policy is presented as a rich link upon your first engagement with the Service and whenever it is materially updated, in accordance with Apple Messages for Business requirements.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Acceptable Use</h2>
            <p className="mb-3">You agree not to use the Service to:</p>
            <ul className="list-disc pl-5 space-y-2 mb-3">
              <li>Violate any applicable local, state, national, or international law or regulation</li>
              <li>Send, store, or transmit unsolicited commercial messages (spam) in violation of A2P messaging regulations</li>
              <li>Transmit any material that is unlawful, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, or otherwise objectionable</li>
              <li>Impersonate any person or entity, or falsely state or misrepresent your affiliation with a person or entity</li>
              <li>Interfere with or disrupt the Service, servers, or networks connected to the Service</li>
              <li>Attempt to gain unauthorised access to any part of the Service, other accounts, or computer systems</li>
              <li>Use the Service to send messages that violate Apple Messages for Business content policies or Infobip's Service Use Policy</li>
              <li>Use automated scripts, bots, or other tools to access the Service in a manner not expressly authorised by us</li>
              <li>Reverse-engineer, decompile, disassemble, or otherwise attempt to derive the source code of the Service</li>
              <li>Use the Service in any manner that could damage, disable, overburden, or impair our infrastructure</li>
            </ul>
            <p>
              We reserve the right to suspend or terminate your access to the Service immediately and without notice if we reasonably believe you have violated these acceptable use provisions.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">11. Intellectual Property</h2>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">11.1 Our Intellectual Property</h3>
            <p className="mb-3">
              The Service, including all software, algorithms, designs, text, graphics, logos, and trademarks, is owned by or licensed to Nest and is protected by copyright, trademark, and other intellectual property laws. Nothing in these Terms grants you any right, title, or interest in the Service beyond the limited right to use it in accordance with these Terms.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">11.2 Your Content</h3>
            <p>
              You retain ownership of all content you provide to the Service (including messages, emails, and calendar data). By using the Service, you grant us a limited, non-exclusive, revocable licence to process your content solely for the purpose of providing and improving the Service. We will not use your content for any other purpose without your explicit consent.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">12. Service Availability and Modifications</h2>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">12.1 Availability</h3>
            <p className="mb-3">
              We strive to maintain high availability of the Service but do not guarantee uninterrupted or error-free operation. The Service may be temporarily unavailable due to scheduled maintenance, updates, or circumstances beyond our reasonable control.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">12.2 Modifications</h3>
            <p className="mb-3">
              We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time. If a modification materially reduces the functionality of the Service, we will provide at least thirty (30) days' prior notice. You may terminate your account if you do not agree with any material modification.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">12.3 Maintenance</h3>
            <p>
              Scheduled maintenance windows will be communicated in advance where practicable. We will use reasonable efforts to minimise disruption during maintenance periods.
            </p>
          </section>

          {/* 13 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">13. Data Retention and Deletion</h2>
            <p className="mb-3">
              We retain your account information, conversation history, and associated data for as long as your account remains active and as necessary to provide the Service. Conversation data may be retained to maintain context, improve response quality, and fulfil our obligations under applicable law.
            </p>
            <p className="mb-3">
              You may request deletion of your account and all associated data at any time by contacting us at the email address below. Upon receiving a valid deletion request, we will remove your data within thirty (30) days, except where retention is required by law, regulation, or legitimate business purposes (such as resolving disputes or enforcing these Terms).
            </p>
            <p>
              Upon account deletion, all OAuth tokens, conversation history, and personal data will be permanently and irreversibly removed from our systems, subject to the exceptions noted above.
            </p>
          </section>

          {/* 14 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">14. Disclaimer of Warranties</h2>
            <p className="mb-3">
              THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ACCURACY.
            </p>
            <p className="mb-3">
              Without limiting the foregoing, we do not warrant that: (a) the Service will meet your specific requirements; (b) the Service will be uninterrupted, timely, secure, or error-free; (c) the results obtained from the use of the Service (including AI-generated content) will be accurate, reliable, or complete; or (d) any errors in the Service will be corrected.
            </p>
            <p>
              You acknowledge that AI-generated content may contain errors, omissions, or inaccuracies, and that you use such content at your own risk. No advice or information, whether oral or written, obtained from us or through the Service shall create any warranty not expressly stated in these Terms.
            </p>
          </section>

          {/* 15 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">15. Limitation of Liability</h2>
            <p className="mb-3">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL NEST, ITS DIRECTORS, OFFICERS, EMPLOYEES, AGENTS, PARTNERS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-3">
              <li>Your access to, use of, or inability to access or use the Service</li>
              <li>Any conduct or content of any third party on or related to the Service</li>
              <li>Any AI-generated content, actions, or recommendations provided by the Service</li>
              <li>Unauthorised access, use, or alteration of your transmissions or content</li>
              <li>Errors, inaccuracies, or omissions in AI-generated output</li>
              <li>Any interruption or cessation of the Service</li>
            </ul>
            <p>
              Our total aggregate liability for all claims arising out of or relating to these Terms or the Service shall not exceed the greater of: (a) the amount you paid to us in the twelve (12) months preceding the claim; or (b) one hundred Australian dollars (AUD $100). This limitation applies regardless of the legal theory upon which the claim is based.
            </p>
          </section>

          {/* 16 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">16. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless Nest and its directors, officers, employees, agents, and affiliates from and against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising out of or in connection with: (a) your use of the Service; (b) your violation of these Terms; (c) your violation of any rights of a third party; (d) any content you submit, post, or transmit through the Service; or (e) any AI-generated action executed at your direction. This indemnification obligation shall survive termination of these Terms and your use of the Service.
            </p>
          </section>

          {/* 17 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">17. Termination</h2>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">17.1 Termination by You</h3>
            <p className="mb-3">
              You may terminate your account at any time by contacting us at the email address below or by ceasing all use of the Service. Upon termination, your right to use the Service will immediately cease.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">17.2 Termination by Us</h3>
            <p className="mb-3">
              We may suspend or terminate your access to the Service at any time, with or without cause, and with or without notice. Grounds for termination include, but are not limited to: violation of these Terms, violation of Apple Messages for Business policies, violation of Infobip compliance guidelines, fraudulent or illegal activity, or conduct that we reasonably believe is harmful to other users or to us.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">17.3 Effect of Termination</h3>
            <p>
              Upon termination, all licences and rights granted to you under these Terms will immediately cease. Sections that by their nature should survive termination shall survive, including but not limited to: Intellectual Property, Disclaimer of Warranties, Limitation of Liability, Indemnification, and Governing Law.
            </p>
          </section>

          {/* 18 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">18. Governing Law and Dispute Resolution</h2>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">18.1 Governing Law</h3>
            <p className="mb-3">
              These Terms shall be governed by and construed in accordance with the laws of the State of New South Wales, Australia, without regard to its conflict of law provisions. You irrevocably submit to the exclusive jurisdiction of the courts of New South Wales, Australia.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">18.2 Dispute Resolution</h3>
            <p>
              Before initiating any formal legal proceedings, you agree to first attempt to resolve any dispute informally by contacting us at the email address below. If the dispute is not resolved within thirty (30) days of your initial contact, either party may pursue formal resolution through the courts of competent jurisdiction in New South Wales, Australia.
            </p>
          </section>

          {/* 19 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">19. General Provisions</h2>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">19.1 Entire Agreement</h3>
            <p className="mb-3">
              These Terms, together with our Privacy Policy and any other policies referenced herein, constitute the entire agreement between you and Nest regarding the Service and supersede all prior agreements, understandings, and communications, whether written or oral.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">19.2 Severability</h3>
            <p className="mb-3">
              If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it valid and enforceable while preserving its original intent.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">19.3 Waiver</h3>
            <p className="mb-3">
              No waiver of any term or condition of these Terms shall be deemed a further or continuing waiver of such term or any other term. Our failure to exercise or enforce any right or provision of these Terms shall not constitute a waiver of such right or provision.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">19.4 Assignment</h3>
            <p className="mb-3">
              You may not assign or transfer these Terms, or any rights or obligations hereunder, without our prior written consent. We may assign these Terms in connection with a merger, acquisition, reorganisation, or sale of all or substantially all of our assets.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">19.5 Force Majeure</h3>
            <p className="mb-3">
              We shall not be liable for any failure or delay in performing our obligations under these Terms where such failure or delay results from circumstances beyond our reasonable control, including but not limited to natural disasters, acts of government, internet or telecommunications failures, power outages, or pandemics.
            </p>

            <h3 className="font-medium text-gray-900 mb-2 mt-4">19.6 Notices</h3>
            <p>
              All notices required or permitted under these Terms shall be in writing and shall be deemed given when delivered by email to the address associated with your account (for notices to you) or to the contact email below (for notices to us).
            </p>
          </section>

          {/* 20 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">20. Contact Us</h2>
            <p className="mb-3">
              If you have any questions, concerns, or requests regarding these Terms of Service, please contact us at:
            </p>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <p className="mb-1"><strong className="text-gray-900 font-medium">Nest</strong></p>
              <p className="mb-1">Email: <a href="mailto:nest.chat@icloud.com" className="text-blue-600 hover:underline">nest.chat@icloud.com</a></p>
              <p>Response time: Within 5 business days</p>
            </div>
          </section>

        </div>
      </motion.main>
    </motion.div>
  )
}

export default function SiteFooter() {
  const whatsappLink = String(import.meta.env.VITE_EVENT_WHATSAPP_URL || '').trim();
  const instagramLink = String(import.meta.env.VITE_EVENT_INSTAGRAM_URL || 'https://www.instagram.com/theignite2.0/?hl=en').trim();

  return (
    <footer className="border-t border-[#303a32] bg-[#111411]/95 backdrop-blur-sm px-4 py-10 text-sm text-gray-400">
      <div className="max-w-7xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-6 md:px-8 md:py-7">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Institution</p>
              <p className="text-gray-200 font-semibold leading-relaxed">
                Engineering Department, Institute of Engineering and Technology
              </p>
              <p className="text-gray-400 mt-1">Deen Dayal Upadhyaya Gorakhpur University, Gorakhpur</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Organizers</p>
              <p>
                Ignite Team
                {' '}| Tech Team:
                {' '}
                <span className="text-[#3b82f6] font-medium">Code Dynamics</span>
              </p>
              <p className="mt-1.5">
                Guided by:{' '}
                <a
                  href="https://teamparadox.in"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#a3b46a] hover:text-[#c4d688] font-medium hover:underline transition-colors"
                >
                  Teamparadox.in
                </a>
              </p>
              <p className="mt-2">
                Event Socials:
                {' '}
                <a
                  href={instagramLink || 'https://www.instagram.com/theignite2.0/?hl=en'}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#E1306C] hover:underline"
                >
                  Instagram
                </a>
                {whatsappLink && (
                  <>
                    {' | '}
                    <a href={whatsappLink} target="_blank" rel="noreferrer" className="text-[#25D366] hover:underline">WhatsApp</a>
                  </>
                )}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Contact</p>
              <p>
                Developer:
                {' '}
                <a href="mailto:j74117204@gmail.com" className="text-[#3b82f6] hover:text-[#93c5fd] transition-colors">j74117204@gmail.com</a>
              </p>
              <p>
                Support:
                {' '}
                <a href="mailto:vy502847@gmail.com" className="text-[#3b82f6] hover:text-[#93c5fd] transition-colors">vy502847@gmail.com</a>
              </p>
              <p className="mt-2">
                <a href="mailto:vy502847@gmail.com?subject=Ignite%202.O%20Feedback" className="text-[#a3b46a] hover:underline">Send feedback</a>
                {' '}with roll number/enrolment number and screenshot for faster support.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-gray-500">
            <p>&copy; 2026 Ignite 2.O. All rights reserved.</p>
            <p>
              Guided by{' '}
              <a
                href="https://teamparadox.in"
                target="_blank"
                rel="noreferrer"
                className="text-[#a3b46a] hover:underline font-medium"
              >
                Teamparadox.in
              </a>
              {' '}&bull; Designed for a smooth and secure registration experience.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

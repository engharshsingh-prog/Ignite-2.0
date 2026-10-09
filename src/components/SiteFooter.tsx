export default function SiteFooter() {
  const whatsappLink = String(import.meta.env.VITE_EVENT_WHATSAPP_URL || '').trim();
  const instagramLink = String(import.meta.env.VITE_EVENT_INSTAGRAM_URL || '').trim();

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
                <a href="https://www.teamparadox.in/" className="text-[#3b82f6] hover:text-[#93c5fd] transition-colors">Team Paradox</a>
              </p>
              {(whatsappLink || instagramLink) && (
                <p className="mt-2">
                  Event Socials:
                  {whatsappLink && (
                    <>
                      {' '}
                      <a href={whatsappLink} target="_blank" rel="noreferrer" className="text-[#25D366] hover:underline">WhatsApp</a>
                    </>
                  )}
                  {whatsappLink && instagramLink && ' | '}
                  {instagramLink && (
                    <a href={instagramLink} target="_blank" rel="noreferrer" className="text-[#E1306C] hover:underline">Instagram</a>
                  )}
                </p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Contact</p>
              <p>
                Developer:
                {' '}
                <a href="mailto:aditya@teamparadox.in" className="text-[#3b82f6] hover:text-[#93c5fd] transition-colors">aditya@teamparadox.in</a>
              </p>
              <p>
                Support:
                {' '}
                <a href="mailto:support@teamparadox.in" className="text-[#3b82f6] hover:text-[#93c5fd] transition-colors">support@teamparadox.in</a>
              </p>
              <p className="mt-2">
                <a href="mailto:support@teamparadox.in?subject=Ignite%202.O%20Feedback" className="text-[#a3b46a] hover:underline">Send feedback</a>
                {' '}with roll number and screenshot for faster support.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-gray-500">
            <p>&copy; 2026 Ignite 2.O. All rights reserved.</p>
            <p>Designed for a smooth and secure registration experience.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

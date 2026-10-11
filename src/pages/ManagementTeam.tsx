import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, ShieldCheck, Users } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { readJsonSafe } from '../lib/http';

interface TeamMember {
  id: number;
  name: string;
  branch: string;
  year: string;
  roles: string[];
  fields: string;
  profile_image: string;
  whatsapp_number: string;
}

function whatsappLink(phone: string) {
  return `https://wa.me/91${phone}`;
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'TM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function ManagementTeam() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch('/api/management-team');
        const data = await readJsonSafe<TeamMember[]>(res);
        setMembers(Array.isArray(data) ? data : []);
      } catch {
        setMembers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, []);

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/20 text-indigo-300 text-sm font-medium mb-4">
            <ShieldCheck size={14} /> Ignite 2.O Operations
          </span>
          <h1 className="text-4xl sm:text-5xl font-black mb-2">Management and Coordination Team</h1>
          <p className="text-gray-400">Connect with the right team member for your query in one click.</p>
        </motion.div>

        {loading ? (
          <LoadingSpinner text="Loading team members..." />
        ) : members.length === 0 ? (
          <div className="text-center py-20">
            <Users size={46} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-500">Team details will be announced soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {members.map((member, index) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-3xl bg-gradient-to-br from-white/[0.07] to-white/[0.03] border border-white/15 p-5 hover:border-indigo-500/40 transition-colors shadow-[0_10px_40px_rgba(0,0,0,0.25)]"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-blue-500 text-white font-bold flex items-center justify-center ring-2 ring-indigo-300/30">
                    {member.profile_image ? (
                      <img src={member.profile_image} alt={member.name} className="w-full h-full object-cover" />
                    ) : (
                      getInitials(member.name)
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-white truncate">{member.name}</h2>
                    <p className="text-xs text-gray-400 truncate">
                      {member.branch} | {member.year}
                    </p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-[11px] text-gray-500 uppercase tracking-[0.12em] mb-2">Roles</p>
                  <div className="flex flex-wrap gap-2">
                    {(member.roles.length ? member.roles : ['Unassigned']).map(role => (
                      <span key={role} className="px-3 py-1 rounded-full text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <p className="text-[11px] text-gray-500 uppercase tracking-[0.12em] mb-2">Fields</p>
                  <p className="text-sm text-gray-200 leading-relaxed">{member.fields || 'Not specified'}</p>
                </div>

                <a
                  href={whatsappLink(member.whatsapp_number)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                >
                  <MessageCircle size={16} /> Open WhatsApp Chat
                </a>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, Filter, Download, Share2, Play } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { readJsonSafe } from '../lib/http';
import { normalizeImageUrl, getVideoEmbedInfo } from '../lib/imageUrl';

interface MediaItem {
  id: number;
  url: string;
  thumb_url: string;
  caption: string;
  type: string;
  category: string;
  uploaded_at: string;
}

export default function Gallery() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);
  const [actionMessage, setActionMessage] = useState('');

  const fetchMedia = async () => {
    try {
      const res = await fetch(`/api/media${filter !== 'all' ? `?category=${filter}` : ''}`);
      const data = await readJsonSafe<MediaItem[]>(res);
      setMedia(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchMedia();
  }, [filter]);

  const clearActionMessage = () => {
    window.setTimeout(() => setActionMessage(''), 1800);
  };

  const handleDownload = () => {
    if (!lightbox) return;
    const { isDrive, downloadUrl } = lightbox.type === 'video'
      ? getVideoEmbedInfo(lightbox.url)
      : { isDrive: false, downloadUrl: lightbox.url };

    const extension = lightbox.type === 'video' ? 'mov' : 'jpg';
    const a = document.createElement('a');
    a.href = isDrive ? downloadUrl : lightbox.url;
    a.download = lightbox.caption || `ignite26-media-${lightbox.id}.${extension}`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleShare = async () => {
    if (!lightbox) return;
    const title = lightbox.caption || 'Ignite 2.O Gallery Media';
    const text = lightbox.caption || 'Check out this media from Ignite 2.O Gallery';
    const link = lightbox.url.startsWith('http') ? lightbox.url : `${window.location.origin}${lightbox.url}`;

    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setActionMessage('Media link copied.');
      clearActionMessage();
    } catch {
      setActionMessage('Unable to share right now.');
      clearActionMessage();
    }
  };

  const filters = [
    { value: 'all', label: 'All Media' },
    { value: 'general', label: 'Event Moments' },
    { value: 'winner', label: 'Winners' },
  ];

  return (
    <div className="min-h-screen text-slate-900 pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full liquid-glass-pill text-sky-800 text-sm font-medium mb-4">
            <Image size={14} className="text-sky-600" /> Media Hub
          </span>
          <h1 className="text-4xl sm:text-5xl font-black mb-3 bg-gradient-to-r from-slate-900 via-sky-700 to-cyan-600 bg-clip-text text-transparent">
            Gallery
          </h1>
          <p className="text-slate-600">Relive the magic of Ignite 2.O</p>
        </motion.div>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 p-1.5 rounded-2xl liquid-glass">
            <Filter size={15} className="text-sky-600 ml-2 mr-1" />
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  filter === f.value
                    ? 'liquid-btn-primary text-white'
                    : 'text-slate-700 hover:text-slate-950 hover:bg-sky-500/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <LoadingSpinner text="Loading gallery..." />
        ) : media.length === 0 ? (
          <div className="text-center py-20 rounded-3xl liquid-glass max-w-lg mx-auto px-6">
            <div className="w-16 h-16 rounded-2xl liquid-icon-bubble mx-auto mb-4 flex items-center justify-center text-sky-600">
              <Image size={32} />
            </div>
            <p className="text-slate-600">No media uploaded yet. Check back after the event!</p>
          </div>
        ) : (
          <motion.div layout className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-5">
            {media.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
                className="break-inside-avoid mb-5 group cursor-pointer relative overflow-hidden rounded-3xl liquid-glass-card p-1.5"
                onClick={() => setLightbox(item)}
              >
                <div className="relative overflow-hidden rounded-2xl">
                  {item.type === 'video' ? (
                    <div className="relative aspect-video bg-slate-900">
                      <img
                        src={normalizeImageUrl(item.thumb_url || item.url)}
                        alt={item.caption || 'Video preview'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full liquid-glass-strong text-slate-900 text-xs font-semibold flex items-center gap-1.5">
                        Video
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-13 h-13 rounded-full liquid-icon-bubble flex items-center justify-center text-sky-700 shadow-lg group-hover:scale-115 transition-transform">
                          <Play size={20} className="fill-sky-600 translate-x-0.5" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={normalizeImageUrl(item.thumb_url || item.url)}
                      alt={item.caption}
                      className="w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <p className="text-white text-sm font-medium">{item.caption}</p>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full mt-1.5 inline-block border ${
                          item.category === 'winner'
                            ? 'bg-violet-500/35 border-violet-300/50 text-violet-100'
                            : 'bg-cyan-500/30 border-cyan-300/50 text-cyan-100'
                        }`}
                      >
                        {item.category}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-xl flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="relative max-w-4xl max-h-[85vh] p-2 rounded-3xl liquid-glass-strong"
              onClick={(e) => e.stopPropagation()}
            >
              {lightbox.type === 'video' ? (
                (() => {
                  const { isDrive, embedUrl } = getVideoEmbedInfo(lightbox.url);
                  if (isDrive) {
                    return (
                      <div className="relative w-[88vw] max-w-4xl aspect-video rounded-2xl overflow-hidden bg-slate-950 shadow-2xl border border-sky-300/30">
                        <iframe
                          src={embedUrl}
                          className="w-full h-full border-0"
                          allow="autoplay; fullscreen"
                          allowFullScreen
                          title={lightbox.caption || 'Video Player'}
                        />
                      </div>
                    );
                  }
                  return (
                    <video
                      src={lightbox.url}
                      poster={normalizeImageUrl(lightbox.thumb_url) || undefined}
                      controls
                      autoPlay
                      playsInline
                      className="max-h-[80vh] w-full max-w-4xl rounded-2xl object-contain bg-slate-950 shadow-2xl"
                    />
                  );
                })()
              ) : (
                <img
                  src={normalizeImageUrl(lightbox.url)}
                  alt={lightbox.caption}
                  className="max-h-[80vh] rounded-2xl object-contain"
                />
              )}
              <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
                <button
                  onClick={handleDownload}
                  className="w-9 h-9 rounded-full liquid-icon-bubble flex items-center justify-center text-slate-900"
                  title="Download media"
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={handleShare}
                  className="w-9 h-9 rounded-full liquid-icon-bubble flex items-center justify-center text-slate-900"
                  title="Share media"
                >
                  <Share2 size={16} />
                </button>
                <button
                  onClick={() => setLightbox(null)}
                  className="w-9 h-9 rounded-full liquid-icon-bubble flex items-center justify-center text-slate-900"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
              {actionMessage && (
                <div className="absolute top-4 left-4 px-3 py-1.5 rounded-xl liquid-glass-strong text-sky-800 text-xs z-20">
                  {actionMessage}
                </div>
              )}
              {lightbox.caption && (
                <div className="absolute bottom-2 left-2 right-2 p-4 bg-gradient-to-t from-slate-950/90 to-transparent rounded-b-2xl pointer-events-none">
                  <p className="text-white font-medium">{lightbox.caption}</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

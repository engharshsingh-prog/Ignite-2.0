import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, Filter, Download, Share2 } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { readJsonSafe } from '../lib/http';

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
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { setLoading(true); fetchMedia(); }, [filter]);

  const clearActionMessage = () => {
    window.setTimeout(() => setActionMessage(''), 1800);
  };

  const handleDownload = () => {
    if (!lightbox) return;
    const extension = lightbox.type === 'video' ? 'mp4' : 'jpg';
    const a = document.createElement('a');
    a.href = lightbox.url;
    a.download = `ignite26-media-${lightbox.id}.${extension}`;
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
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-300 text-sm font-medium mb-4">
            <Image size={14} /> Media Hub
          </span>
          <h1 className="text-4xl sm:text-5xl font-black mb-3">Gallery</h1>
          <p className="text-gray-400">Relive the magic of Ignite 2.O</p>
        </motion.div>

        <div className="flex items-center justify-center gap-3 mb-10">
          <Filter size={16} className="text-gray-500" />
          {filters.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f.value
                  ? 'bg-[#3b82f6] text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? <LoadingSpinner text="Loading gallery..." /> : media.length === 0 ? (
          <div className="text-center py-20">
            <Image size={48} className="mx-auto text-gray-700 mb-4" />
            <p className="text-gray-500">No media uploaded yet. Check back after the event!</p>
          </div>
        ) : (
          <motion.div layout className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
            {media.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                className="break-inside-avoid mb-4 group cursor-pointer relative overflow-hidden rounded-2xl"
                onClick={() => setLightbox(item)}>
                {item.type === 'video' ? (
                  <div className="relative">
                    <img src={item.thumb_url || item.url} alt={item.caption || 'Video preview'}
                      className="w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-black/65 text-white text-xs">Video</div>
                  </div>
                ) : (
                  <img src={item.thumb_url || item.url} alt={item.caption}
                    className="w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="text-white text-sm font-medium">{item.caption}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                      item.category === 'winner' ? 'bg-olive-500/30 text-olive-300' : 'bg-blue-500/30 text-blue-300'
                    }`}>{item.category}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="relative max-w-4xl max-h-[85vh]" onClick={e => e.stopPropagation()}>
              {lightbox.type === 'video' ? (
                <video src={lightbox.url} poster={lightbox.thumb_url || undefined} controls autoPlay className="max-h-[80vh] rounded-2xl object-contain" />
              ) : (
                <img src={lightbox.url} alt={lightbox.caption} className="max-h-[80vh] rounded-2xl object-contain" />
              )}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70"
                  title="Download media"
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={handleShare}
                  className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70"
                  title="Share media"
                >
                  <Share2 size={16} />
                </button>
                <button
                  onClick={() => setLightbox(null)}
                  className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
              {actionMessage && (
                <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-black/65 text-white text-xs">
                  {actionMessage}
                </div>
              )}
              {lightbox.caption && (
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 rounded-b-2xl">
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


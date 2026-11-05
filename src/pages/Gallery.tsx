import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Image,
  Filter,
  Download,
  Share2,
  Play,
  Video,
  Film,
  Sparkles,
  Trophy,
  ArrowRight,
  Upload,
} from 'lucide-react';
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
      let query = '';
      if (filter === 'video') query = '?type=video';
      else if (filter === 'image') query = '?type=image';
      else if (filter === 'general') query = '?category=general';
      else if (filter === 'winner') query = '?category=winner';

      const res = await fetch(`/api/media${query}`);
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

  // Video items for featured slot
  const videoItems = useMemo(() => media.filter((m) => m.type === 'video'), [media]);

  const filters = [
    { value: 'all', label: 'All Media', icon: Sparkles },
    { value: 'video', label: 'Videos Slot', icon: Video, badge: 'Videos' },
    { value: 'image', label: 'Photos', icon: Image },
    { value: 'general', label: 'Moments', icon: Film },
    { value: 'winner', label: 'Winners', icon: Trophy },
  ];

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-300 text-sm font-medium mb-4 border border-blue-500/30">
            <Sparkles size={14} /> Media & Video Hub
          </span>
          <h1 className="text-4xl sm:text-5xl font-black mb-3">
            Ignite <span className="bg-gradient-to-r from-olive-300 to-blue-400 bg-clip-text text-transparent">Gallery</span>
          </h1>
          <p className="text-gray-400 max-w-xl mx-auto text-sm sm:text-base">
            Relive the energy, stage performances, candid moments, and video reels from Ignite 2.O.
          </p>
        </motion.div>

        {/* Filter / Slot Navigation Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 mb-10">
          <div className="hidden sm:flex items-center gap-1.5 text-gray-500 text-xs font-semibold uppercase tracking-wider mr-2">
            <Filter size={14} /> Slots:
          </div>
          {filters.map((f) => {
            const Icon = f.icon;
            const isSelected = filter === f.value;
            const isVideoSlot = f.value === 'video';

            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all relative ${
                  isSelected
                    ? isVideoSlot
                      ? 'bg-gradient-to-r from-blue-600 to-emerald-600 text-white shadow-lg shadow-blue-500/25 scale-[1.03]'
                      : 'bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white shadow-lg shadow-blue-500/20 scale-[1.02]'
                    : isVideoSlot
                      ? 'bg-blue-500/10 border border-blue-500/30 text-blue-300 hover:bg-blue-500/20'
                      : 'bg-[#191e1b]/90 border border-[#303a32] text-gray-400 hover:text-white hover:border-white/20'
                }`}
              >
                <Icon size={15} className={isSelected ? 'text-white' : isVideoSlot ? 'text-blue-400' : 'text-gray-400'} />
                <span>{f.label}</span>
                {isVideoSlot && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                )}
              </button>
            );
          })}
        </div>

        {/* Loading State */}
        {loading ? (
          <LoadingSpinner text="Loading gallery media..." />
        ) : (
          <>
            {/* FEATURED VIDEO SLOT: Shown when on 'all' and videos exist */}
            {filter === 'all' && videoItems.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-12 p-6 rounded-3xl bg-gradient-to-br from-[#191e1b] via-[#141916] to-[#1a221d] border border-blue-500/30 shadow-2xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex items-center justify-between mb-5 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center">
                      <Film size={20} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Video Highlights Slot
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                          {videoItems.length} {videoItems.length === 1 ? 'Video' : 'Videos'}
                        </span>
                      </h2>
                      <p className="text-xs text-gray-400">Tap any video to play directly</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setFilter('video')}
                    className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                  >
                    Open Videos Slot <ArrowRight size={13} />
                  </button>
                </div>

                <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {videoItems.slice(0, 3).map((item) => (
                    <div
                      key={`featured-video-${item.id}`}
                      onClick={() => setLightbox(item)}
                      className="group relative aspect-video rounded-2xl overflow-hidden border border-[#303a32] bg-[#121613] cursor-pointer shadow-xl hover:border-blue-400 transition-all hover:-translate-y-1"
                    >
                      <img
                        src={normalizeImageUrl(item.thumb_url || item.url)}
                        alt={item.caption || 'Video thumbnail'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%231a221d"/><text x="50%" y="50%" fill="%2360a5fa" font-size="16" text-anchor="middle" dominant-baseline="middle">Ignite 2.O Video</text></svg>';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/45 group-hover:bg-black/25 transition-colors" />

                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs font-semibold flex items-center gap-1.5 shadow">
                        <Video size={12} className="text-blue-400" /> Video
                      </span>

                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-13 h-13 rounded-full bg-blue-600/90 backdrop-blur-md border border-white/40 flex items-center justify-center text-white shadow-xl shadow-blue-500/40 group-hover:scale-115 group-hover:bg-blue-500 transition-all duration-300">
                          <Play size={22} className="fill-white translate-x-0.5" />
                        </div>
                      </div>

                      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
                        <p className="text-white text-sm font-semibold truncate">{item.caption || 'Event Video Clip'}</p>
                        <span className="text-[11px] text-gray-300 uppercase tracking-wider">{item.category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* DEDICATED VIDEOS SLOT VIEW */}
            {filter === 'video' ? (
              <div>
                <div className="mb-8 flex items-center justify-between flex-wrap gap-4 p-5 rounded-2xl bg-[#191e1b]/80 border border-[#303a32]">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-300 flex items-center justify-center">
                      <Video size={22} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Videos & Reels Slot</h2>
                      <p className="text-xs text-gray-400">
                        {media.length > 0
                          ? `Showing ${media.length} official event videos & clips.`
                          : 'Official video highlights, stage shows, and event reels.'}
                      </p>
                    </div>
                  </div>

                  <Link
                    to="/admin/media-import"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-semibold hover:bg-blue-500/30 transition-colors"
                  >
                    <Upload size={14} /> Add Video
                  </Link>
                </div>

                {media.length === 0 ? (
                  <div className="text-center py-20 bg-[#191e1b]/40 rounded-3xl border border-white/5 max-w-2xl mx-auto p-8">
                    <div className="w-20 h-20 rounded-3xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-4 text-blue-400">
                      <Film size={36} />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">No Videos in the Slot Yet</h3>
                    <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
                      Event highlights, stage showdowns, afterparties, and drone footage will be showcased right here!
                    </p>
                    <div className="flex justify-center gap-3">
                      <button
                        onClick={() => setFilter('all')}
                        className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors"
                      >
                        View All Photos & Media
                      </button>
                      <Link
                        to="/admin/media-import"
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                      >
                        Upload Video
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {media.map((item, i) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="group relative aspect-video rounded-2xl overflow-hidden border border-[#303a32] bg-[#121613] cursor-pointer shadow-xl hover:border-blue-400 transition-all hover:-translate-y-1"
                        onClick={() => setLightbox(item)}
                      >
                        <img
                          src={normalizeImageUrl(item.thumb_url || item.url)}
                          alt={item.caption || 'Video thumbnail'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%231a221d"/><text x="50%" y="50%" fill="%2360a5fa" font-size="16" text-anchor="middle" dominant-baseline="middle">Ignite 2.O Video</text></svg>';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />

                        {/* Video Badge */}
                        <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs font-semibold flex items-center gap-1.5 shadow">
                          <Video size={12} className="text-blue-400" /> Video
                        </span>

                        {/* Center Glowing Play Icon */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-14 h-14 rounded-full bg-blue-600/90 backdrop-blur-md border border-white/40 flex items-center justify-center text-white shadow-xl shadow-blue-500/40 group-hover:scale-115 group-hover:bg-blue-500 transition-all duration-300">
                            <Play size={24} className="fill-white translate-x-0.5" />
                          </div>
                        </div>

                        {/* Bottom Information */}
                        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
                          <p className="text-white text-sm font-semibold truncate">{item.caption || 'Ignite 2.O Video'}</p>
                          <span className="text-[11px] text-gray-300 uppercase tracking-wider">{item.category}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* STANDARD MASONRY GRID (for All, Photos, Moments, Winners) */
              <>
                {media.length === 0 ? (
                  <div className="text-center py-20">
                    <Image size={48} className="mx-auto text-gray-700 mb-4" />
                    <p className="text-gray-500">No media uploaded in this slot yet. Check back soon!</p>
                  </div>
                ) : (
                  <motion.div layout className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
                    {media.map((item, i) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className="break-inside-avoid mb-4 group cursor-pointer relative overflow-hidden rounded-2xl border border-white/5 hover:border-blue-500/40 transition-all shadow-lg"
                        onClick={() => setLightbox(item)}
                      >
                        {item.type === 'video' ? (
                          <div className="relative aspect-video bg-[#121613]">
                            <img
                              src={normalizeImageUrl(item.thumb_url || item.url)}
                              alt={item.caption || 'Video preview'}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src =
                                  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%231a221d"/><text x="50%" y="50%" fill="%2360a5fa" font-size="14" text-anchor="middle" dominant-baseline="middle">Ignite 2.O Video</text></svg>';
                              }}
                            />
                            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs font-semibold flex items-center gap-1.5">
                              <Video size={12} className="text-blue-400" /> Video
                            </span>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-12 h-12 rounded-full bg-blue-600/90 backdrop-blur-sm border border-white/40 flex items-center justify-center text-white shadow-lg group-hover:scale-115 transition-transform">
                                <Play size={20} className="fill-white translate-x-0.5" />
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

                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="absolute bottom-0 left-0 right-0 p-4">
                            <p className="text-white text-sm font-semibold">{item.caption || 'Ignite 2.O Moment'}</p>
                            <span
                              className={`text-xs px-2.5 py-0.5 rounded-full mt-1.5 inline-block font-medium ${
                                item.category === 'winner'
                                  ? 'bg-olive-500/30 text-olive-300 border border-olive-500/40'
                                  : 'bg-blue-500/30 text-blue-300 border border-blue-500/40'
                              }`}
                            >
                              {item.category}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.92 }}
              className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              {lightbox.type === 'video' ? (
                (() => {
                  const { isDrive, embedUrl } = getVideoEmbedInfo(lightbox.url);
                  if (isDrive) {
                    return (
                      <iframe
                        src={embedUrl}
                        className="w-[90vw] max-w-4xl aspect-video rounded-2xl border border-white/20 shadow-2xl bg-black"
                        allow="autoplay; encrypted-media; fullscreen"
                        allowFullScreen
                        title={lightbox.caption || 'Video Player'}
                      />
                    );
                  }
                  return (
                    <video
                      src={lightbox.url}
                      poster={normalizeImageUrl(lightbox.thumb_url) || undefined}
                      controls
                      autoPlay
                      playsInline
                      className="max-h-[80vh] w-full max-w-4xl rounded-2xl object-contain shadow-2xl bg-black"
                    />
                  );
                })()
              ) : (
                <img
                  src={normalizeImageUrl(lightbox.url)}
                  alt={lightbox.caption}
                  className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-2xl"
                />
              )}

              {/* Action Buttons: Download, Share, Close */}
              <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
                <button
                  onClick={handleDownload}
                  className="w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/90 transition-colors shadow-lg"
                  title="Download media"
                >
                  <Download size={17} />
                </button>
                <button
                  onClick={handleShare}
                  className="w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/90 transition-colors shadow-lg"
                  title="Share media"
                >
                  <Share2 size={17} />
                </button>
                <button
                  onClick={() => setLightbox(null)}
                  className="w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/90 transition-colors shadow-lg"
                  title="Close"
                >
                  <X size={19} />
                </button>
              </div>

              {actionMessage && (
                <div className="absolute top-3 left-3 px-3.5 py-1.5 rounded-xl bg-black/80 border border-white/20 text-white text-xs font-medium shadow-lg">
                  {actionMessage}
                </div>
              )}

              {lightbox.caption && (
                <div className="w-full max-w-4xl mt-3 p-3.5 rounded-xl bg-black/70 border border-white/10 backdrop-blur-sm text-center">
                  <p className="text-white text-sm font-medium">{lightbox.caption}</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

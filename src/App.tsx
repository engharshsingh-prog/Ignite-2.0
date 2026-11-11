import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import LiquidBackdrop from './components/LiquidBackdrop';
import Home from './pages/Home';
import Register from './pages/Register';
import Gallery from './pages/Gallery';
import HallOfFame from './pages/HallOfFame';
import MyProfile from './pages/MyProfile';
import ManagementTeam from './pages/ManagementTeam';
import PublicMediaUpload from './pages/PublicMediaUpload';
import PublicRegistrationsView from './pages/PublicRegistrationsView';
import ValidationHandler from './pages/ValidationHandler';
import AdminLogin from './pages/admin/Login';
import AdminDashboard from './pages/admin/Dashboard';
import MediaUpload from './pages/admin/MediaUpload';
import MediaBulkImport from './pages/admin/MediaBulkImport';
import WinnersManager from './pages/admin/WinnersManager';
import BulkPassDownload from './pages/admin/BulkPassDownload';
import QrScannerPage from './pages/admin/QrScannerPage';
import ManagementTeamManager from './pages/admin/ManagementTeamManager';
import ActivityLogsHidden from './pages/admin/ActivityLogsHidden';
import EventSettings from './pages/admin/EventSettings';
import ControlCenter from './pages/admin/ControlCenter';
import SuperAdminControl from './pages/admin/SuperAdminControl';
import AdminManager from './pages/admin/AdminManager';
import AdminGuard from './components/AdminGuard';
import SiteFooter from './components/SiteFooter';

export default function App() {
  return (
    <BrowserRouter>
      <div className="relative min-h-screen flex flex-col bg-white text-slate-900">
        <LiquidBackdrop />
        <Navbar />
        <main className="relative z-10 flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/register" element={<Register />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/hall-of-fame" element={<HallOfFame />} />
            <Route path="/management-team" element={<ManagementTeam />} />
            <Route path="/upload-media" element={<PublicMediaUpload />} />
            <Route path="/records/:token" element={<PublicRegistrationsView />} />
            <Route path="/validate/:token" element={<ValidationHandler />} />
            <Route path="/my-profile" element={<MyProfile />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
            <Route path="/admin/scan" element={<AdminGuard><QrScannerPage /></AdminGuard>} />
            <Route path="/admin/super" element={<AdminGuard requireSuperAdmin><SuperAdminControl /></AdminGuard>} />
            <Route path="/admin/control" element={<AdminGuard requireSuperAdmin><SuperAdminControl /></AdminGuard>} />
            <Route path="/admin/control-legacy" element={<AdminGuard requireSuperAdmin><ControlCenter /></AdminGuard>} />
            <Route path="/admin/control/admins" element={<AdminGuard requireSuperAdmin><AdminManager /></AdminGuard>} />
            <Route path="/admin/upload" element={<AdminGuard><MediaUpload /></AdminGuard>} />
            <Route path="/admin/upload-bulk" element={<AdminGuard><MediaBulkImport /></AdminGuard>} />
            <Route path="/admin/bulk-passes" element={<AdminGuard><BulkPassDownload /></AdminGuard>} />
            <Route path="/admin/winners" element={<AdminGuard><WinnersManager /></AdminGuard>} />
            <Route path="/admin/event-settings" element={<AdminGuard><EventSettings /></AdminGuard>} />
            <Route path="/admin/management-team" element={<AdminGuard><ManagementTeamManager /></AdminGuard>} />
            <Route path="/admin/_activity-log-room-26" element={<AdminGuard><ActivityLogsHidden /></AdminGuard>} />
          </Routes>
        </main>
        <div className="relative z-10">
          <SiteFooter />
        </div>
      </div>
    </BrowserRouter>
  );
}

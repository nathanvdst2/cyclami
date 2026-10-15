import { Bell, Bike, Search, Compass, Home, MessageCircle, User } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import AccountMenu from './AccountMenu.jsx';
import { t } from '../i18n/index.js';
import Brand from './Brand.jsx';

const ITEMS = [
  { id: 'discover', label: t('Découvrir'), icon: Compass },
  { id: 'rides', label: t('Sorties'), icon: Bike },
  { id: 'feed', label: t('Fil'), icon: Home },
  { id: 'messages', label: t('Messages'), icon: MessageCircle },
  { id: 'profile', label: t('Profil'), icon: User },
];

export default function Nav({ page, go }) {
  const { unreadCount, unreadNotifications } = useApp();
  return (
    <>
      <header className="sticky top-0 z-20 flex print:hidden items-center justify-between border-b border-emerald-100 bg-emerald-50/90 px-4 py-3 backdrop-blur">
        <button onClick={() => go('discover')} aria-label="Cyclami">
          <Brand />
        </button>
        <div className="flex items-center gap-3">
          <button onClick={() => go('search')} className="p-1 text-stone-600" aria-label={t('Rechercher')}>
            <Search size={22} className={page === 'search' ? 'text-teal-600' : ''} />
          </button>
          <button onClick={() => go('notifications')} className="relative p-1 text-stone-600" aria-label={t('Notifications')}>
            <Bell size={22} className={page === 'notifications' ? 'text-teal-600' : ''} />
            {unreadNotifications > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {unreadNotifications}
              </span>
            )}
          </button>
          <AccountMenu go={go} />
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-20 print:hidden border-t border-emerald-100 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl justify-around">
          {ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                page === id ? 'text-teal-600' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <span className="relative">
                <Icon size={22} strokeWidth={page === id ? 2.5 : 2} />
                {id === 'messages' && unreadCount > 0 && (
                  <span className="absolute -right-2 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

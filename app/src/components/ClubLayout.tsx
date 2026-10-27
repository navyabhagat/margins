import { createContext, useContext, useEffect } from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import type { MyClub } from '@margins';
import { margins } from '../lib/margins';
import { useLoad } from '../lib/hooks';
import { Loading, Logo, Notice } from './bits';

interface ClubContextValue {
  club: MyClub;
  me: string;
  isAdmin: boolean;
  isOwner: boolean;
  reloadClub: () => Promise<void>;
}

const ClubContext = createContext<ClubContextValue | null>(null);

export function useClub() {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error('useClub must be used inside a club');
  return ctx;
}

export function ClubLayout({ me }: { me: string }) {
  const { clubId = '' } = useParams();
  const { data: clubs, error, loading, reload } = useLoad(() => margins.myClubs(), [clubId]);
  const club = clubs?.find((c) => c.id === clubId);

  useEffect(() => {
    if (club) {
      try { localStorage.setItem('margins:lastClub', club.id); } catch { /* storage unavailable */ }
    }
  }, [club]);

  if (loading && !clubs) return <Loading />;
  if (error) return <div className="page no-tabs"><Notice error>{error}</Notice></div>;
  if (!club) {
    try { if (localStorage.getItem('margins:lastClub') === clubId) localStorage.removeItem('margins:lastClub'); } catch { /* ignore */ }
    return (
      <div className="page no-tabs">
        <Logo width={150} />
        <h1>this club isn’t on <em>your shelf</em></h1>
        <p className="meta">You might not be a member yet, or the link is old.</p>
        <Link className="btn" to="/clubs">See your clubs</Link>
      </div>
    );
  }

  const value: ClubContextValue = {
    club, me,
    isAdmin: club.role === 'owner' || club.role === 'admin',
    isOwner: club.role === 'owner',
    reloadClub: reload,
  };

  return (
    <ClubContext.Provider value={value}>
      <Outlet />
      <TabBar clubId={club.id} />
    </ClubContext.Provider>
  );
}

function TabBar({ clubId }: { clubId: string }) {
  const base = `/club/${clubId}`;
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : undefined);
  return (
    <nav className="tabbar" aria-label="Club">
      <NavLink to={base} end className={cls}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5c2.5-1 5-1 8 1 3-2 5.5-2 8-1V19c-2.5-1-5-1-8 1-3-2-5.5-2-8-1z" /><path d="M12 6.5V20" /></svg>
        this month
      </NavLink>
      <NavLink to={`${base}/table`} className={cls}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5h14v10H9l-4 4z" /></svg>
        the table
      </NavLink>
      <NavLink to={`${base}/shelf`} className={cls}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4v16M9 4v16M14 5l4 15M3 20h18" /></svg>
        our shelf
      </NavLink>
      <NavLink to={`${base}/club`} className={cls}>
        <Logo mark width={14} />
        club
      </NavLink>
    </nav>
  );
}

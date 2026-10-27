import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { configError, supabase } from './lib/margins';
import { Loading, Logo, Notice } from './components/bits';
import { ClubLayout } from './components/ClubLayout';
import { Welcome } from './screens/Welcome';
import { Clubs } from './screens/Clubs';
import { ThisMonth } from './screens/ThisMonth';
import { Table } from './screens/Table';
import { Shelf } from './screens/Shelf';
import { BookPage } from './screens/BookPage';
import { ClubSettings } from './screens/ClubSettings';

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (configError) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="shell">
      <div className="grain" aria-hidden="true" />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="pencil" x="-20%" y="-5%" width="140%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {configError ? (
        <div className="page no-tabs"><Logo width={160} /><Notice error>{configError}</Notice></div>
      ) : session === undefined ? (
        <Loading />
      ) : !session ? (
        <Welcome />
      ) : (
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/clubs" element={<Clubs />} />
            <Route path="/club/:clubId" element={<ClubLayout me={session.user.id} />}>
              <Route index element={<ThisMonth />} />
              <Route path="table" element={<Table />} />
              <Route path="shelf" element={<Shelf />} />
              <Route path="book/:bookId" element={<BookPage />} />
              <Route path="club" element={<ClubSettings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      )}
    </div>
  );
}

/** Opens the club you used last, or the club list. */
function Home() {
  let last: string | null = null;
  try { last = localStorage.getItem('margins:lastClub'); } catch { /* storage unavailable */ }
  if (last) return <Navigate to={`/club/${last}`} replace />;
  return <Clubs />;
}

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  Menu, X, Sun, Moon, SendHorizonal,
  UserPlus, LogIn, LogOut, History 
} from 'lucide-react';
import { getAuth, signOut, onAuthStateChanged } from "firebase/auth";
import { db } from './firebaseConfig';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import './HomePage.css';
import { HashLoader } from "react-spinners";


const getCurrentUser = () => {
  try {
    const userString = localStorage.getItem('currentUser');
    return userString ? JSON.parse(userString) : null;
  } catch (error) {
    console.error("Error parsing user data from localStorage", error);
    return null;
  }
};

const useWindowSize = () => {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return { isDesktop };
};

const Logo = () => (
  
    <span className="logo-text">SafarBuddy</span>
);





function HistorySidebar({ isDarkMode, onHistoryClick, isOpen, toggleSidebar }) {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser?.id) {
      setIsLoading(false);
      setHistory([]);
      return;
    }
    const historyQuery = query(
      collection(db, 'searchHistory'),
      where('userId', '==', currentUser.id),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(historyQuery, (qs) => {
      const updated = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistory(updated);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
   
      <div className="sidebar-inner">
        <div className="sidebar-header"><h3>Search History</h3></div>
        {isLoading && <p className="muted">Loading...</p>}
        {!isLoading && history.length === 0 && <p className="muted">No history yet. Start a new search!</p>}
        {!isLoading && history.length > 0 && (
          <ul className="history-list">
            {history.map(item => (
              <li key={item.id}
                className={`history-item ${hoveredId === item.id ? 'hover' : ''}`}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onHistoryClick(item.prompt)}
                title={item.prompt}>
                {item.prompt}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Header({ isDarkMode, toggleDarkMode, isDesktop, currentUser, onLogout, onToggleSidebar }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="header">

        
      <div className="container header-content">
         <div className="header-actions"> 
         {/* History Button */}
          {currentUser && (
            <button aria-label="View History" className="icon-btn , padding-left: 0%;" onClick={onToggleSidebar}>
              <History />
            </button>
          )}
        <Logo />
        </div>

       

        <div className="header-actions">
         

          {/* Theme Toggle */}
          <button aria-label="Toggle theme" className="icon-btn" onClick={toggleDarkMode}>
            {isDarkMode ? <Sun /> : <Moon />}
          </button>

          {/* User / Menu */}
          {isDesktop ? (
            currentUser ? (
              <div className="user-area">
                <span className="user-name">{currentUser.displayName || currentUser.email}</span>
                <button onClick={onLogout} className="btn logout-btn"><LogOut /></button>
              </div>
            ) : (
              <Link to="/" className="btn">Login / Sign Up</Link>
            )
          ) : (
            <button className="icon-btn" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          )}
        </div>
      </div>

      {isMenuOpen && !isDesktop && (
        <div className="mobile-menu">
          <a href="#how-it-works" className="mobile-link">How It Works</a>
          {currentUser ? (
            <button onClick={onLogout} className="btn full-width logout-btn">Logout</button>
          ) : (
            <Link to="/" className="btn full-width">Login / Sign Up</Link>
          )}
        </div>
      )}
    </header>
  );
}

function Hero({ onFormSubmit, isLoading, itinerary, error }) {
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isSendHovered, setIsSendHovered] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isLoading) return;

    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id) {
      try {
        const historyCollectionRef = collection(db, "searchHistory");
        await addDoc(historyCollectionRef, {
          userId: currentUser.id,
          prompt: trimmed,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Error saving search history:", err);
      }
    }

    onFormSubmit(trimmed);
  };

  return (
    <section className="hero">
      <div className="animated-bg" />
      <div className="container hero-inner">
        <div className="hero-content">
          {!itinerary && !isLoading && !error && (
            <>
              <h1 className="hero-title">Your Authentic Indian Adventure, Crafted in Seconds.</h1>
              <p className="hero-sub">Tell us your travel dream. We'll handle the rest.</p>
            </>
          )}

          {isLoading && <HashLoader
         color="var(--loader-color)"
          speedMultiplier={1}
          />
 }

          {error && <div className="results error">Error: {error}</div>}
{itinerary && (
  <div className="results">
    <ReactMarkdown
      components={{
        img: ({ node, ...props }) => (
          <div className="md-img">
            <img {...props} alt={props.alt || ''} />
          </div>
        ),

      
        a: ({ node, ...props }) => (
          <a
            {...props}
            target="_blank"
            rel="noopener noreferrer"
            className="md-link"
          >
            {props.children}
          </a>
        ),
      }}
    >
      {itinerary}
    </ReactMarkdown>

  </div>
)}

        </div>

        <div className="hero-form">
          <form onSubmit={handleSubmit}>
            <div className={`input-wrapper ${isFocused ? 'focused' : ''}`}>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="A 5-day spiritual trip to Varanasi for a solo traveler..."
                required
                className="prompt-textarea"
              />
              <button
                type="submit"
                disabled={isLoading}
                className={`send-btn ${isSendHovered ? 'hover' : ''}`}
                onMouseEnter={() => setIsSendHovered(true)}
                onMouseLeave={() => setIsSendHovered(false)}
                aria-label="Send"
              >
                <SendHorizonal />
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        
        <p className="muted">&copy; {new Date().getFullYear()} SufferBuddy All rights reserved.
          <br />
        
          <br /> SufferBuddy can make mistakes. Please check twices.
        </p>
      </div>
    </footer>
  );
}

export default function HomePage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { isDesktop } = useWindowSize();
  const [isLoading, setIsLoading] = useState(false);
  const [itinerary, setItinerary] = useState(null);
  const [error, setError] = useState(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser({ uid: user.uid, email: user.email, displayName: user.displayName });
      } else {
        setCurrentUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const toggleDarkMode = () => setIsDarkMode(prev => !prev);

  const handleLogout = () => {
    const auth = getAuth();
    signOut(auth).then(() => {
      setCurrentUser(null);
      window.location.reload();
    }).catch(err => console.error("Logout Error:", err));
  };

  const handleFormSubmit = async (prompt) => {
    setIsLoading(true);
    setItinerary(null);
    setError(null);
    try {
      const response = await fetch("http://localhost:5001/api/generate-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Unknown error");
      }
      const data = await response.json();
      setItinerary(data.itinerary);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleHistoryClick = (prompt) => {
    handleFormSubmit(prompt);
    setIsSidebarOpen(false);
  };

  return (
    <div className={`page-root ${isDarkMode ? 'dark' : ''}`}>
      <Header
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        isDesktop={isDesktop}
        currentUser={currentUser}
        onLogout={handleLogout}
        onToggleSidebar={() => setIsSidebarOpen(s => !s)}
      />

      <div className="page-wrapper">
        {currentUser && (
          <HistorySidebar
            isDarkMode={isDarkMode}
            onHistoryClick={handleHistoryClick}
            isOpen={isSidebarOpen}
            toggleSidebar={() => setIsSidebarOpen(s => !s)}
          />
        )}

        <div className="main-content">
          <main>
            <Hero
              onFormSubmit={handleFormSubmit}
              isLoading={isLoading}
              itinerary={itinerary}
              error={error}
            />
          </main>
          <Footer />
        </div>
      </div>

      {showLoginPrompt && !currentUser && (
        <div className="login-prompt visible">
          <button className="close-x" onClick={() => setShowLoginPrompt(false)}><X /></button>
          <p className="prompt-text">Ready to start your journey?</p>
          <div className="prompt-actions">
            <Link to="/" className="btn outline"><LogIn /> Login</Link>
            <Link to="/" className="btn primary"><UserPlus /> Sign Up</Link>
          </div>
        </div>
      )}
    </div>
  );
}

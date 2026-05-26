'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const CAROUSEL_IMAGES = [
  { src: '/Assets/ryx.jpg', alt: 'ryx' },
  { src: '/Assets/vita.png', alt: 'vitabeauty' },
  { src: '/Assets/fs.jpg', alt: 'facial care' },
];

const BENEFITS = [
  {
    src: '/Assets/sun-protection.png',
    title: 'Avoids UV Ray',
    description: 'Wearing sunscreen protects you from harmful UV rays that can cause skin cancer.',
  },
  {
    src: '/Assets/skinhealth.png',
    title: 'Increase Skin Health',
    description: "Maintains skin health by protecting against the sun's ultraviolet rays.",
  },
  {
    src: '/Assets/aging.png',
    title: 'Prevents Skin Aging',
    description: 'Prevents aging including wrinkles, brown spots, and irregular pigmentation.',
  },
  {
    src: '/Assets/allergy.png',
    title: 'Protects Against Sun Allergy',
    description: 'Regular application can reduce the risk caused by UVB and UVA.',
  },
  {
    src: '/Assets/healthcare.png',
    title: 'Improve Overall Health',
    description: 'Sun protection helps preserve immune function after exposure.',
  },
];

const RECOMMENDATIONS = [
  { number: 1, title: 'Rejuvenating set', description: 'Ryxskin Glowbomb' },
  { number: 2, title: 'Hydration set', description: 'Vita Moisture Boost' },
  { number: 3, title: 'Glow kit', description: 'Radiant Essentials' },
];

const API_URL = '/api/php/main';

export default function Home() {
  const [userId, setUserId] = useState(null);
  const [username, setUsername] = useState('Guest');
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const savedUserId = localStorage.getItem('user_id');
    if (savedUserId) {
      setUserId(savedUserId);
      fetchUserInfo(savedUserId);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((current) => (current + 1) % CAROUSEL_IMAGES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const fetchUserInfo = async (id) => {
    try {
      const data = await postForm({ FunctionName: 'get_user_info', user_id: id });
      if (data?.username) {
        setUsername(data.username);
        localStorage.setItem('username', data.username);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const postForm = async (data) => {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(data),
      credentials: 'include',
    });

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    setUserId(null);
    setUsername('Guest');
  };

  const slideIndicatorStyles = (index) => ({
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    border: '1px solid #fff',
    margin: '0 6px',
    background: index === activeSlide ? '#fff' : 'transparent',
    cursor: 'pointer',
  });

  return (
    <main>
      <header className="nav_sticky sticky-top">
        <nav>
          <div className="container-fluid nav_container">
            <div className="brand_block">
              <div className="brand_logo">
                <img src="/Assets/InVoice.png" alt="InVoice logo" />
                <span className="brand_name">InVoice</span>
              </div>
              <span className="brand_tag">Beauty · Sales · Inventory</span>
            </div>
            <form className="form-inline search_container" onSubmit={(e) => e.preventDefault()}>
              <input className="form-control" type="search" placeholder="Search products" aria-label="Search" />
              <button className="search_button" type="submit">Search</button>
            </form>
            <div className={userId ? 'loginn' : 'users_tab'}>
              {userId ? (
                <div className="dropdown login_dropdown">
                  <button
                    className="btn btn-secondary dropdown-toggle"
                    type="button"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                  >
                    <span>
                      <i className="fa-solid fa-circle-user user_logo"></i>
                    </span>
                    <span>{`Hello, ${username}`}</span>
                  </button>
                  <ul className="dropdown-menu">
                    <li>
                      <a className="dropdown-item" href="/dashboard">
                        Dashboard
                      </a>
                    </li>
                    <li>
                      <button className="dropdown-item" type="button" onClick={handleLogout}>
                        Logout
                      </button>
                    </li>
                  </ul>
                </div>
              ) : (
                <>
                  <Link href="/login" className="btn login_btn">
                    Login
                  </Link>
                  <Link href="/signup" className="btn signup_btn">
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>
      </header>

      <section id="carousel-con" className="hero_cta_section">
        <div className="hero_cta_box container-max">
          <p className="eyebrow">Invoice and inventory tracking</p>
          <h2>Ready to start your own website with invoice and inventory tracking?</h2>
          <p className="hero_cta_text">Create your account now!</p>
          <button className="btn btn-primary">Create Account</button>
        </div>
      </section>

    </main>
  );
}

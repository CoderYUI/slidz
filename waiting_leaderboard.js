import { TimeSync } from './timeSync.js';
import { realtimeDb } from './firebase-config.js';
import { ref, onValue } from 'firebase/database';

const timeSync = new TimeSync();

// Add this after existing imports
function setupResetListener() {
    const resetRef = ref(realtimeDb, 'systemState/reset');
    onValue(resetRef, (snapshot) => {
        const resetData = snapshot.val();
        if (resetData?.action === 'reset') {
            alert('System reset initiated. Thank you for participating!');
            window.location.replace('/thankyou.html');
        }
    });
}

// Theme switching functionality
const themeIcon = document.getElementById('theme-icon');
themeIcon.addEventListener('click', () => {
    const themeSwitch = themeIcon.parentElement;
    themeSwitch.classList.add('switching');
    document.body.classList.toggle('dark-theme');
    themeIcon.setAttribute('name', 
        document.body.classList.contains('dark-theme') ? 'sunny-outline' : 'moon-outline'
    );
    setTimeout(() => {
        themeSwitch.classList.remove('switching');
    }, 500);
});

// Carousel content with leaderboard-specific messages
const slides = [
    {
        image: '/public/images/trophy.png',
        text: 'The moment of triumph awaits! Stay tuned as we prepare to showcase the champions of this challenge.'
    },
    {
        image: '/public/images/trophy.png',
        text: 'Your dedication and perseverance have brought you to this moment. The results will be revealed soon!'
    },
    {
        image: '/public/images/trophy.png',
        text: 'Every participant is a winner in their own right. The leaderboard will showcase the outstanding achievements of all.'
    },
    {
        image: '/public/images/trophy.png',
        text: 'The anticipation builds as we prepare to celebrate the success of all participants.'
    },
    {
        image: '/public/images/trophy.png',
        text: 'Your journey through this challenge has been remarkable. The final rankings will be displayed shortly.'
    }
];

// Initialize carousel
let currentSlide = 0;
const carousel = document.querySelector('.carousel');
const dotsContainer = document.querySelector('.dots-container');

// Create slides and dots
slides.forEach((slide, index) => {
    // Create slide
    const slideElement = document.createElement('div');
    slideElement.className = `slide ${index === 0 ? 'active' : ''}`;
    slideElement.innerHTML = `
        <img src="${slide.image}" alt="Trophy Image ${index + 1}" draggable="false">
        <p>${slide.text}</p>
    `;
    carousel.appendChild(slideElement);

    // Create dot
    const dot = document.createElement('div');
    dot.className = `dot ${index === 0 ? 'active' : ''}`;
    dot.addEventListener('click', () => goToSlide(index));
    dotsContainer.appendChild(dot);
});

// Enhanced navigation functions
function updateSlides() {
    document.querySelectorAll('.slide').forEach((slide, index) => {
        if (index === currentSlide) {
            slide.className = 'slide active';
        } else if (index < currentSlide || (currentSlide === 0 && index === slides.length - 1)) {
            slide.className = 'slide prev';
        } else {
            slide.className = 'slide';
        }
    });
    
    document.querySelectorAll('.dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlide);
    });
}

// Add touch support for mobile
let touchStartX = 0;
let touchEndX = 0;

carousel.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

carousel.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, { passive: true });

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            nextSlide();
        } else {
            prevSlide();
        }
    }
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % slides.length;
    updateSlides();
}

function prevSlide() {
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    updateSlides();
}

// Add event listeners for navigation
document.querySelector('.next-btn').addEventListener('click', nextSlide);
document.querySelector('.prev-btn').addEventListener('click', prevSlide);

// Auto-advance slides every 5 seconds with pause on hover
let autoSlide = setInterval(nextSlide, 5000);

carousel.addEventListener('mouseenter', () => clearInterval(autoSlide));
carousel.addEventListener('mouseleave', () => {
    autoSlide = setInterval(nextSlide, 5000);
});

// Update the leaderboard check function
function checkLeaderboard() {
    const gameStateRef = ref(realtimeDb, 'gameState');
    onValue(gameStateRef, (snapshot) => {
        const gameState = snapshot.val();
        if (!gameState) return;

        // Only redirect when admin publishes leaderboard
        if (gameState.leaderboardPublished) {
            window.location.href = 'leaderboard.html';
            return;
        }

        // Display waiting message based on player status
        const statusText = document.querySelector('.waiting-info h2');
        if (statusText) {
            const completionData = JSON.parse(sessionStorage.getItem('completionData') || '{}');
            statusText.textContent = completionData.status === 'completed' ?
                'Puzzle completed! Waiting for leaderboard...' :
                'Time\'s up! Waiting for leaderboard...';
        }
    });
}

// Initialize with smooth loading and listeners
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    requestAnimationFrame(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    });
    checkLeaderboard(); // Only call once to set up the listener
});

// Add to initialization
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    setupResetListener();
});

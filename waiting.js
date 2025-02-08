import { TimeSync } from './timeSync.js';
import { db, realtimeDb } from './firebase-config.js';
import { ref, onValue } from 'firebase/database';
import { collection, getDocs } from 'firebase/firestore';  // Add this import

const timeSync = new TimeSync();

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

// Carousel content
const slides = [
    {
        image: '/public/images/puzzle.png',
        text: 'Each piece of the puzzle represents a step towards understanding the bigger picture. Just as you solved this challenge, life\'s mysteries unfold one piece at a time.'
    },
    {
        image: '/public/images/puzzle.png',
        text: 'Like a puzzle, success comes from patience, strategy, and the ability to see patterns in chaos. Your achievement here mirrors this truth.'
    },
    {
        image: '/public/images/puzzle.png',
        text: 'The journey of problem-solving is like assembling a puzzle - it requires perspective, persistence, and the courage to try different approaches.'
    },
    {
        image: '/public/images/puzzle.png',
        text: 'Every puzzle solved is a testament to human ingenuity and determination. Your success here proves that challenges are opportunities in disguise.'
    },
    {
        image: '/public/images/puzzle.png',
        text: 'Just as each puzzle piece has its place, every challenge you overcome fits perfectly into your journey of growth and discovery.'
    },
    {
        image: '/public/images/puzzle.png',
        text: 'The satisfaction of solving a puzzle mirrors life\'s greatest achievements - both require dedication, focus, and the willingness to learn from mistakes.'
    },
    {
        image: '/public/images/puzzle.png',
        text: 'Like the pieces of a puzzle coming together, your success here is part of a larger picture of achievement and personal growth.'
    },
    {
        image: '/public/images/puzzle.png',
        text: 'The art of problem-solving, like puzzle-solving, teaches us that every challenge has a solution waiting to be discovered.'
    },
    {
        image: '/public/images/puzzle.png',
        text: 'Your accomplishment in solving this puzzle demonstrates that with the right mindset, any obstacle can be overcome.'
    },
    {
        image: '/public/images/puzzle.png',
        text: 'As this puzzle concludes, remember that every challenge you face is an opportunity to prove your resilience and creativity.'
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
        <img src="${slide.image}" alt="Puzzle Image ${index + 1}">
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

// Enhanced slide transition
function goToSlide(index) {
    if (index === currentSlide) return;
    
    const direction = index > currentSlide ? 1 : -1;
    const slides = document.querySelectorAll('.slide');
    
    slides[currentSlide].style.transform = `translateX(${-direction * 100}%)`;
    slides[index].style.transform = `translateX(${direction * 100}%)`;
    
    requestAnimationFrame(() => {
        slides[index].style.transition = 'transform 0.5s ease-out';
        slides[currentSlide].style.transition = 'transform 0.5s ease-out';
        slides[index].style.transform = 'translateX(0)';
        slides[currentSlide].style.transform = `translateX(${direction * -100}%)`;
    });
    
    currentSlide = index;
    updateSlides();
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

// Navigation functions
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

// Auto-advance slides every 5 seconds
setInterval(nextSlide, 5000);

// Enhanced timer animation
function startTimer() {
    const timerDisplay = document.getElementById('timer');
    const originalStartTime = parseInt(sessionStorage.getItem('gameStartTime'));
    const timeLimit = parseInt(sessionStorage.getItem('gameTimeLimit'));
    
    if (!originalStartTime || !timeLimit) {
        console.error('Missing timer data, redirecting to leaderboard');
        window.location.href = 'leaderboard.html';
        return;
    }

    const timerInterval = timeSync.startTimer(
        timerDisplay, 
        originalStartTime, 
        () => {
            // When timer completes
            clearInterval(timerInterval);
            window.location.href = 'leaderboard.html';
        }
    );

    return timerInterval;
}

// Start timer with existing game time
const timerInterval = startTimer();

// Clean up on page unload
window.addEventListener('unload', () => {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
});

// Add manual continue button handler
const continueBtn = document.getElementById('continueBtn');
if (continueBtn) {
    continueBtn.addEventListener('click', () => {
        const startTime = parseInt(sessionStorage.getItem('gameStartTime'));
        const timeLimit = parseInt(sessionStorage.getItem('gameTimeLimit'));
        const now = timeSync.getServerTime();
        
        // Only allow early continue if admin enabled it
        if (sessionStorage.getItem('allowEarlyContinue') === 'true' || 
            (now - startTime >= timeLimit)) {
            window.location.href = 'leaderboard.html';
        } else {
            alert('Please wait for the timer to complete');
        }
    });
}

// Initialize with smooth loading
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    requestAnimationFrame(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    });
});

// Listen for game completion and leaderboard publication
function listenForGameCompletion() {
    const gameStateRef = ref(realtimeDb, 'gameState');
    onValue(gameStateRef, async (snapshot) => {
        const gameState = snapshot.val();
        if (!gameState) return;

        try {
            // If leaderboard is published, go directly to leaderboard
            if (gameState.leaderboardPublished) {
                window.location.href = 'leaderboard.html';
                return;
            }

            // Get the latest completion count
            const completionsRef = collection(db, 'completions');
            const completionsSnapshot = await getDocs(completionsRef);
            const finishedCount = completionsSnapshot.docs.length;

            // If all players finished, go to waiting_leaderboard
            if (finishedCount >= gameState.totalPlayers) {
                console.log('All players finished, redirecting to waiting_leaderboard');
                window.location.href = 'waiting_leaderboard.html';
            }
        } catch (error) {
            console.error('Error checking completions:', error);
        }
    });
}

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

// Initialize listeners
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    listenForGameCompletion();
    setupResetListener();
});

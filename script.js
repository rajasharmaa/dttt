function loadinganimation() {
  // Only run loading animation on desktop
  if (window.innerWidth > 768) {
    gsap.from("#head,#head1,.pera1", {
      y: 30,
      opacity: 0,
      delay: 0.3,
      duration: 0.8,
      stagger: 0.2,
      ease: "power2.out"
    });
    
    gsap.from("nav", {
      y: -20,
      opacity: 0,
      delay: 0.1,
      duration: 0.5,
      ease: "power2.out"
    });
  } else {
    // Mobile: Simple fade in
    document.querySelectorAll("#head, #head1, .pera1").forEach(el => {
      el.style.opacity = '1';
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadinganimation();
  
  // Only create heavy background animation on desktop
  if (window.innerWidth > 768) {
    createIndustrialBackground();
  }
});

// Industrial Pipe Background Animation
function createIndustrialBackground() {
  const pipesContainer = document.querySelector('.pipes-container');
  const particlesContainer = document.querySelector('.particles-container');
  const colors = ['rgba(58, 123, 213, 0.1)', 'rgba(65, 131, 215, 0.15)', 'rgba(72, 139, 217, 0.2)'];
  
  // Create pipes
  for (let i = 0; i < 6; i++) {
    const pipe = document.createElement('div');
    pipe.className = 'pipe';
    pipesContainer.appendChild(pipe);
    
    const isVertical = Math.random() > 0.5;
    const duration = gsap.utils.random(40, 60);
    const size = gsap.utils.random(8, 20);
    const length = gsap.utils.random(150, 300);
    
    gsap.set(pipe, {
      width: isVertical ? `${size}px` : `${length}px`,
      height: isVertical ? `${length}px` : `${size}px`,
      background: colors[Math.floor(Math.random() * colors.length)],
      x: isVertical ? gsap.utils.random(0, window.innerWidth) : -length,
      y: isVertical ? -length : gsap.utils.random(0, window.innerHeight)
    });
    
    gsap.to(pipe, {
      x: isVertical ? gsap.utils.random(0, window.innerWidth) : window.innerWidth + length,
      y: isVertical ? window.innerHeight + length : gsap.utils.random(0, window.innerHeight),
      duration: duration,
      ease: "none",
      repeat: -1
    });
  }
  
  // Create pipe connectors
  for (let i = 0; i < 10; i++) {
    const connector = document.createElement('div');
    connector.className = 'pipe-connector';
    pipesContainer.appendChild(connector);
    
    const size = gsap.utils.random(12, 30);
    
    gsap.set(connector, {
      width: `${size}px`,
      height: `${size}px`,
      x: gsap.utils.random(0, window.innerWidth),
      y: gsap.utils.random(0, window.innerHeight),
      opacity: 0
    });
    
    gsap.to(connector, {
      opacity: 0.2,
      duration: gsap.utils.random(4, 8),
      yoyo: true,
      repeat: -1,
      delay: gsap.utils.random(0, 3)
    });
  }
  
  // Create floating particles (weld sparks) - fewer on mobile
  const particleCount = window.innerWidth > 768 ? 15 : 8;
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particlesContainer.appendChild(particle);
    
    const size = gsap.utils.random(2, 4);
    
    gsap.set(particle, {
      width: `${size}px`,
      height: `${size}px`,
      x: gsap.utils.random(0, window.innerWidth),
      y: gsap.utils.random(0, window.innerHeight),
      opacity: 0
    });
    
    // Spark animation
    const tl = gsap.timeline({ repeat: -1, delay: gsap.utils.random(0, 5) });
    tl.to(particle, {
      opacity: 0.6,
      duration: 0.4,
      ease: "power1.out"
    })
    .to(particle, {
      x: "+=40",
      y: "+=40",
      duration: 1.2,
      ease: "power1.inOut"
    })
    .to(particle, {
      opacity: 0,
      duration: 0.4,
      ease: "power1.in"
    });
  }
}

// Make background responsive to window resize
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const pipesContainer = document.querySelector('.pipes-container');
    const particlesContainer = document.querySelector('.particles-container');
    
    if (pipesContainer && particlesContainer) {
      pipesContainer.innerHTML = '';
      particlesContainer.innerHTML = '';
      
      // Only recreate on desktop
      if (window.innerWidth > 768) {
        createIndustrialBackground();
      }
    }
  }, 250);
});

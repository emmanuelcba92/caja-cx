/**
 * Utility to handle smooth scrolling to the top of the main content area.
 * This is necessary because the main scroll container is a specific <section> 
 * rather than the window itself.
 */
export const scrollToTop = () => {
    // Try to find the main scroll container in App.jsx
    const container = document.querySelector('section.flex-1.overflow-y-auto');
    
    if (container) {
        container.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    } else {
        // Fallback for unexpected layouts
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
};

/**
 * Starfield Background Component
 * OpenContent IDE
 * 
 * Optimized falling stars animation using Canvas.
 * Exactly as user requested, high performance.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import './Starfield.css';

function Starfield({ starCount = 600 }) {
    const canvasRef = useRef(null);
    const starsRef = useRef([]);
    const animationRef = useRef(null);
    const { isDark } = useTheme();

    const getColors = useCallback(() => {
        return isDark
            ? ['#FFFFFF', '#CCCCCC', '#999999']
            : ['#000000', '#333333', '#555555'];
    }, [isDark]);

    const createStars = useCallback((width, height) => {
        const colors = getColors();
        const stars = [];
        for (let i = 0; i < starCount; i++) {
            stars.push({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: Math.random() * 0.8 + 0.2, // Puntos pequeños
                vx: (Math.random() - 0.5) * 0.3,
                vy: Math.random() * 2.5 + 1.2, // Más rápidas, como el ejemplo
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }
        return stars;
    }, [starCount, getColors]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            starsRef.current = createStars(canvas.width, canvas.height);
        };

        const animate = () => {
            // Efecto estela (motion blur)
            if (isDark) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            }
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            starsRef.current.forEach(star => {
                star.y += star.vy;
                star.x += star.vx;

                // Reset
                if (star.y > canvas.height + star.radius) {
                    star.y = 0 - star.radius;
                    star.x = Math.random() * canvas.width;
                }
                if (star.x > canvas.width + star.radius) star.x = 0 - star.radius;
                if (star.x < 0 - star.radius) star.x = canvas.width + star.radius;

                ctx.beginPath();
                ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
                ctx.fillStyle = star.color;
                ctx.fill();
            });

            animationRef.current = requestAnimationFrame(animate);
        };

        resize();
        animate();
        window.addEventListener('resize', resize);

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationRef.current);
        };
    }, [isDark, createStars]);

    return <canvas ref={canvasRef} id="starfield-background" />;
}

export default Starfield;

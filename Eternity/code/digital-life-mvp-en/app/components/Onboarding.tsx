'use client'

import { useState, useEffect } from 'react'

interface OnboardingProps {
  onComplete: () => void
  userName?: string
}

const steps = [
  {
    title: 'Welcome to Digital Life',
    subtitle: 'Your personal biography starts here',
    description: 'We help you capture and preserve your life stories through guided questions and voice recordings. Your memories become a beautiful biography for future generations.',
    icon: '🌟',
  },
  {
    title: 'Answer Questions',
    subtitle: 'One story at a time',
    description: 'Browse through thoughtful questions about your life. Select one that resonates with you, then record your answer using voice or text. Each answer adds another chapter to your story.',
    icon: '🎙️',
  },
  {
    title: 'Add Photos',
    subtitle: 'Bring your stories to life',
    description: 'Upload photos that capture special moments. Tag family members and add context. These visuals will enrich your biography and help readers connect with your journey.',
    icon: '📸',
  },
  {
    title: 'Build Your Family Tree',
    subtitle: 'Connect the generations',
    description: 'Create your family network by adding relatives and their relationships. This helps contextualize your stories and creates a complete picture for future readers.',
    icon: '🌳',
  },
  {
    title: 'Export Your Biography',
    subtitle: 'Share your legacy',
    description: 'When you\'re ready, export your complete biography as a beautiful PDF or eBook. Perfect for printing, sharing with family, or preserving for the future.',
    icon: '📖',
  },
]

export function Onboarding({ onComplete, userName }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handleSkip = () => {
    handleComplete()
  }

  const handleComplete = () => {
    setIsVisible(false)
    localStorage.setItem('onboarding_completed', 'true')
    setTimeout(onComplete, 300)
  }

  if (!isVisible) return null

  const step = steps[currentStep]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(5, 16, 25, 0.95)',
        backdropFilter: 'blur(10px)',
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '90%',
          background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08), rgba(124, 58, 237, 0.08))',
          border: '1px solid rgba(0, 212, 255, 0.2)',
          borderRadius: 16,
          padding: 32,
          textAlign: 'center',
          animation: 'slideUp 0.4s ease',
        }}
      >
        {/* Progress Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          {steps.map((_, idx) => (
            <div
              key={idx}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: idx === currentStep
                  ? 'linear-gradient(135deg, #00d4ff, #0099ff)'
                  : idx < currentStep
                  ? '#00d4ff'
                  : 'rgba(255, 255, 255, 0.2)',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Icon */}
        <div
          style={{
            fontSize: 64,
            marginBottom: 20,
            animation: 'pulse 2s ease infinite',
          }}
        >
          {step.icon}
        </div>

        {/* Welcome with name */}
        {currentStep === 0 && userName && (
          <p style={{ color: '#00d4ff', fontSize: 14, marginBottom: 8 }}>
            Hello, {userName}!
          </p>
        )}

        {/* Title */}
        <h2
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: '#ffffff',
            marginBottom: 8,
          }}
        >
          {step.title}
        </h2>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 14,
            color: '#00d4ff',
            marginBottom: 16,
            fontWeight: 500,
          }}
        >
          {step.subtitle}
        </p>

        {/* Description */}
        <p
          style={{
            fontSize: 15,
            color: '#c8d4e0',
            lineHeight: 1.7,
            marginBottom: 32,
          }}
        >
          {step.description}
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={handleSkip}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 8,
              color: '#8899aa',
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Skip Tour
          </button>
          <button
            onClick={handleNext}
            style={{
              padding: '12px 32px',
              background: 'linear-gradient(135deg, #00d4ff, #0099ff)',
              border: 'none',
              borderRadius: 8,
              color: '#051019',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
          </button>
        </div>

        {/* Step counter */}
        <p style={{ marginTop: 20, fontSize: 12, color: '#667788' }}>
          Step {currentStep + 1} of {steps.length}
        </p>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}

export default Onboarding

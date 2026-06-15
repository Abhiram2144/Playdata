'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface Step {
  number: number;
  label: string;
  description?: string;
}

interface OnboardingStepperProps {
  steps: Step[];
  currentStep: number;
}

export function OnboardingStepper({ steps, currentStep }: OnboardingStepperProps) {
  return (
    <div className="mb-8">
      <div className="flex items-start gap-4">
        {steps.map((step, index) => {
          const isCompleted = step.number < currentStep;
          const isCurrent = step.number === currentStep;
          const isNext = step.number > currentStep;

          return (
            <div key={step.number} className="flex-1 flex items-start gap-3">
              {/* Step Circle */}
              <motion.div
                initial={false}
                animate={{
                  backgroundColor: isCompleted
                    ? '#10b981'
                    : isCurrent
                      ? '#4f46e5'
                      : '#e2e8f0',
                  scale: isCurrent ? 1.1 : 1,
                }}
                className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white cursor-pointer"
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <span className={isCompleted ? 'text-white' : isCurrent ? 'text-white' : 'text-slate-600'}>
                    {step.number}
                  </span>
                )}
              </motion.div>

              {/* Step Info */}
              <div className="flex-1 pt-1">
                <motion.p
                  animate={{ fontWeight: isCurrent ? 600 : 500 }}
                  className={`text-sm ${isCurrent ? 'text-indigo-600' : isCompleted ? 'text-green-600' : 'text-slate-600'}`}
                >
                  {step.label}
                </motion.p>
                {step.description && (
                  <p className="text-xs text-slate-500 mt-1">{step.description}</p>
                )}
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <motion.div
                  initial={false}
                  animate={{
                    backgroundColor: isCompleted ? '#10b981' : '#e2e8f0',
                  }}
                  className="absolute left-[calc(2.5rem+theme(spacing.4))] top-10 w-0.5 h-12"
                  style={{
                    position: 'absolute',
                    marginLeft: 'calc(-50vw + 50%)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress Bar */}
      <motion.div
        className="mt-6 h-1 bg-slate-200 rounded-full overflow-hidden"
        initial={false}
      >
        <motion.div
          animate={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="h-full bg-indigo-600"
        />
      </motion.div>
    </div>
  );
}

// Tips & Info page content.
export function CvsTipsPanel() {
  return (
    <>
      <div className="rounded-lg bg-gray-800 p-5">
        <h2 className="mb-3 text-lg font-semibold text-white">
          What is Computer Vision Syndrome?
        </h2>
        
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          <p>
            Computer Vision Syndrome (CVS), also known as digital eye strain, is
            a group of eye and vision-related problems caused by prolonged screen
            use. Symptoms include dry eyes, eye strain, headaches, and blurred
            vision. Research suggests that up to 90% of regular computer users
            experience some form of CVS.
          </p>
          <p>
            One of the main causes is reduced blinking. When we focus on screens,
            our blink rate can drop significantly - studies have shown it can fall
            from around 22 blinks per minute at rest to as few as 7 during screen
            use. Blinking is essential for keeping the surface of the eye moist
            and comfortable.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-gray-800 p-5">
        <h2 className="mb-3 text-lg font-semibold text-white">
          How BlinkBuddy helps
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          <p>
            BlinkBuddy uses your webcam to monitor your blink rate in real time.
            When you go too long without blinking, it sends you a gentle
            reminder. All processing happens locally on your device - no video is
            recorded, stored, or transmitted.
          </p>
          <p>
            The goal is simple: help you become more aware of your blinking
            habits so you can stay comfortable during long screen sessions.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-gray-800 p-5">
        <h2 className="mb-3 text-lg font-semibold text-white">
          Quick start guide
        </h2>
      
        <ol className="list-decimal list-inside space-y-2 text-sm leading-relaxed text-gray-300">
          <li>
            Go to Settings and choose your camera
          </li>
          <li>
            Set your blink window - this is how many seconds without a blink
            before you get a reminder (default is 20 seconds)
          </li>
          <li>
            Choose which reminder types you'd like (screen glow, popup, sound,
            or a combination)
          </li>
          <li>Go to Monitor and press Start</li>
          <li>
            BlinkBuddy will run in the background - you'll only notice it when
            you need to blink
          </li>
        </ol>
      </div>

      <div className="rounded-lg bg-gray-800 p-5">
        <h2 className="mb-3 text-lg font-semibold text-white">
          The 20-20-20 rule
        </h2>
        <p className="text-sm leading-relaxed text-gray-300">
          Every 20 minutes, look at something 20 feet (about 6 metres) away for
          20 seconds. This gives your eye muscles a chance to relax and helps
          reduce fatigue. You can enable 20-20-20 break reminders in Settings.
        </p>
      </div>

      <div className="rounded-lg bg-gray-800 p-5">
        <h2 className="mb-3 text-lg font-semibold text-white">
          Screen setup tips
        </h2>
        <p className="text-sm leading-relaxed text-gray-300">
          Keep your screen about 50-70 cm (20-28 inches) from your eyes. The top
          of the screen should be at or slightly below eye level, so you look
          slightly downward when reading. This position reduces the amount of
          exposed eye surface and slows tear evaporation.
        </p>
      </div>

      <div className="rounded-lg bg-gray-800 p-5">
        <h2 className="mb-3 text-lg font-semibold text-white">
          Lighting and environment
        </h2>
        <p className="text-sm leading-relaxed text-gray-300">
          Position your screen to avoid glare from windows or overhead lights.
          Try to match your screen brightness to the ambient lighting in the room
          - if the screen looks like a light source, it's too bright; if it looks
          dull and grey, it's too dim. Consider using a humidifier in dry
          environments, as low humidity accelerates tear evaporation.
        </p>
      </div>

      {/* Disclaimer card. */}
      <div className="rounded-lg border border-amber-500/30 bg-gray-800 p-5">
        <h2 className="mb-3 text-lg font-semibold text-amber-200/80">
          Important note
        </h2>
        <p className="text-sm leading-relaxed text-gray-300">
          BlinkBuddy is a wellness and awareness tool. It is not a medical device
          and does not diagnose, treat, or prevent any condition. If you
          experience persistent eye discomfort, please consult an eye care
          professional.
        </p>
      </div>
    </>
  )
}
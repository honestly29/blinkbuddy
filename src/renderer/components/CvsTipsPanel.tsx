// tips sourced from established CVS literature.
const tips = [
  {
    title: '20-20-20 Rule',
    text: 'Every 20 minutes, look at something 20 feet (6 metres) away for 20 seconds to relax your focusing muscles.',
  },
  {
    title: 'Screen Distance',
    text: 'Keep your screen 50–70 cm from your eyes — roughly arm\u2019s length — with the top of the screen at or just below eye level.',
  },
  {
    title: 'Blink Awareness',
    text: 'Prolonged screen use can reduce your blink rate by up to 60%. Conscious blinking helps maintain tear film stability and reduces dry-eye symptoms.',
  },
  {
    title: 'Lighting',
    text: 'Match your screen brightness to the surrounding room. Avoid glare from windows or overhead lights by positioning your screen perpendicular to light sources.',
  },
  {
    title: 'Font Size',
    text: 'Use a comfortable font size — at least 12pt. Squinting to read small text increases eye strain and reduces blink rate.',
  },
]

// A static, read-only panel displaying evidence-based tips for reducing Computer Vision Syndrome (CVS) symptoms.
export function CvsTipsPanel() {
  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-400">Eye Health Tips</h2>
      <ul className="space-y-3">
        {tips.map((tip) => (
          <li key={tip.title}>
            <p className="text-sm font-medium text-white">{tip.title}</p>
            <p className="text-sm text-gray-400">{tip.text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
/**
 * Steps — step indicator component.
 *
 * Props:
 *   steps: Array<{ label: string, state: 'done' | 'active' | 'default', n?: number }>
 *
 * state 'done'    → shows checkmark ✓
 * state 'active'  → filled terracotta circle
 * state 'default' → numbered outline circle
 */
export default function Steps({ steps }) {
  return (
    <div className="steps">
      {steps.map((step, idx) => (
        <span key={idx} style={{ display: 'inline-flex', alignItems: 'center' }}>
          <span className={`step ${step.state}`}>
            <span className="n">
              {step.state === 'done' ? '✓' : (step.n ?? idx + 1)}
            </span>
            <span className="lbl">{step.label}</span>
          </span>
          {idx < steps.length - 1 && <span className="sep" />}
        </span>
      ))}
    </div>
  );
}

import { Link } from 'react-router-dom'
import Dialog from './Dialog'
export default function WorkspaceHelp({ close }: { close: () => void }) {
  return (
    <Dialog title="A quick guide to your workspace" close={close}>
      <p>
        Follow the evidence from source to response. Your working data stays private until an
        administrator approves a publication.
      </p>
      <ol className="help-steps">
        <li>
          <strong>Collect trustworthy reports.</strong>
          <p>
            Use Reports & data for CSV imports, or Data feeds for supported sources. Check dates and
            definitions in Data health.
          </p>
        </li>
        <li>
          <strong>Understand the reporting window.</strong>
          <p>
            Overview and the map separate local, regional and national reporting. Missing reports do
            not mean zero cases.
          </p>
        </li>
        <li>
          <strong>Review changes.</strong>
          <p>
            Weekly review compares compatible reporting periods. Try its fictional demo to learn how
            missing data and population denominators affect results.
          </p>
        </li>
        <li>
          <strong>Coordinate follow-up.</strong>
          <p>
            Investigations record an owner, priority and activity. Observations are linked
            explicitly. Alerts flag thresholds for human review.
          </p>
        </li>
        <li>
          <strong>Share reviewed findings.</strong>
          <p>
            Publication review prepares a private snapshot. Only an administrator can publish it.
            The public portal contains approved reports.
          </p>
        </li>
      </ol>
      <div className="actions">
        <Link className="button primary" to="/review?demo=complete" onClick={close}>
          Try the weekly review demo
        </Link>
        <button onClick={close}>Back to workspace</button>
      </div>
    </Dialog>
  )
}

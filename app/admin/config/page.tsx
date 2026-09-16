import { AdminShell } from "@/components/layout/admin-shell";
import { ConfigActions } from "@/components/admin/config-actions";
import { requireAdmin } from "@/src/db/auth";
import { getExperimentConfigs } from "@/src/db/admin";

export default async function ConfigPage() {
  const { token } = await requireAdmin(); const configs = await getExperimentConfigs(token);
  return <AdminShell active="config"><div className="admin-page"><header className="admin-page-heading"><div><span>Study governance</span><h1>Experiment configuration</h1><p>Freeze reproducible settings before main data collection and choose the active version.</p></div></header><section className="sessions-section"><div className="sessions-table-wrap"><table><thead><tr><th>Version</th><th>Phase</th><th>Assignment</th><th>Model</th><th>Frozen</th><th>Action</th></tr></thead><tbody>{configs.map((config) => <tr key={config.id}><td>{config.config_version}</td><td>{config.study_phase}</td><td>{config.assignment_method}</td><td>{config.model_version}</td><td>{config.frozen_at ? new Date(config.frozen_at).toLocaleString() : "No"}</td><td><ConfigActions id={config.id} active={config.is_active} frozen={Boolean(config.frozen_at)} /></td></tr>)}</tbody></table></div></section></div></AdminShell>;
}

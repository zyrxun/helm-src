import { exec } from "child_process";
import path from "path";
import { userWorkflows } from "./config";

class WorkflowEngine {
  public run(workflowId: string) {
    const workflow = userWorkflows.find(w => w.id === workflowId);
    if (!workflow) return console.log("Workflow not found");

    console.log(`🚀 Triggering workflow: ${workflow.name}`);

    workflow.apps.forEach(app => {
      const jxaPath = path.join(__dirname, "..", "src", "platform", "macos", "launch.jxa");
      const urlParam = app.urlToOpen ? `"${app.urlToOpen}"` : "";

      // Run the JXA script asynchronously through macOS osascript
      exec(`osascript -l JavaScript "${jxaPath}" "${app.name}" ${urlParam}`, (err, stdout) => {
        if (err) {
          console.error(`❌ Failed to open ${app.name}:`, err.message);
          return;
        }
        console.log(`✅ ${stdout.trim()}`);
      });
    });
  }
}

const engine = new WorkflowEngine();
engine.run("focus-mode");

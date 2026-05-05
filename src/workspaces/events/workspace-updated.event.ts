export class WorkspaceUpdatedEvent {
  event: 'workspace_locked' | 'workspace_freed';
  workspaceId: number;
  startTime: Date;
  endTime: Date;
}

export interface CliCommandSpec {
  readonly path: readonly [string, ...Array<string>]
  readonly positional: ReadonlyArray<string>
  readonly description: string
  readonly behavior?: CliCommandBehavior
}

interface CliCommandBehavior {
  readonly confirmation?: CliConfirmationPolicy
  readonly fileInput?: CliFileInputPolicy
  readonly fileOutput?: CliFileOutputPolicy
}

interface CliConfirmationPolicy {
  readonly message: string
  readonly type: "requires-yes"
}

interface CliFileOutputPolicy {
  readonly attachmentIdField: string
  readonly type: "attachment-download"
}

interface CliFileInputPolicy {
  readonly fields: ReadonlyArray<string>
}

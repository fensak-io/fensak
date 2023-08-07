/**
 * The operation on a line in a hunk of a patch.
 * @property Unknown Unknown operation.
 * @property Insert The line was inserted in this hunk.
 * @property Delete The line was deleted in this hunk .
 * @property Modified The line was modified in this hunk.
 * @property Untouched The line was not touched in this hunk. This is usually provided to provide context.
 */
export enum LineOp {
  Unknown = "unknown",
  Insert = "insert",
  Delete = "delete",
  Modified = "modified",
  Untouched = "untouched",
}

/**
 * Represents updates to a single line in a hunk.
 * @property pos The position of the line in the source file.
 * @property op The operation that was done to the line in the hunk.
 * @property text The text context for the operation. For insert operations, this is the line to insert; for delete
 *                operations, this is the line to delete; for modifications this is the resulting text.
 */
export interface ILineDiff {
  pos: number;
  op: LineOp;
  text: string;
}

/**
 * Represents updates to a section of the file in a patch.
 * @property originalStart The starting line in the original file (before the change) where the hunk applies.
 * @property originalLength The number of lines after the start in the original file where the hunk applies.
 * @property updatedStart The starting line in the updated file (before the change) where the hunk applies.
 * @property updatedLength The number of lines after the start in the updated file where the hunk applies.
 * @property diffOperations The list of modifications to apply to the source file in the range to get the updated file.
 */
export interface IHunk {
  originalStart: number;
  originalLength: number;
  updatedStart: number;
  updatedLength: number;
  diffOperations: ILineDiff[];
}

/**
 * The operation on the file in the patch.
 * @property Unknown Unknown operation.
 * @property Insert The file was inserted in this patch.
 * @property Delete The file was deleted in this patch.
 * @property Modified The file was modified in this patch.
 */
export enum PatchOp {
  Unknown = "unknown",
  Insert = "insert",
  Delete = "delete",
  Modified = "modified",
}

/**
 * Represents updates to a single file that was done in the change set.
 * @property path The relative path (from the root of the repo) to the file that was updated in the patch.
 * @property op The operation that was done on the file in the patch.
 * @property originalFull The full contents of the original file (before the change). This is empty if the operation is
 *                        Insert.
 * @property updatedFull The full contents of the updated file (after the change). This is empty if the operation is
 *                       Delete.
 * @property diff The list of diffs, organized into hunks.
 */
export interface IPatch {
  path: string;
  op: PatchOp;
  originalFull: string;
  updatedFull: string;
  diff: IHunk[];
}

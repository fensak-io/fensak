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
 * @property op The operation that was done to the line in the hunk.
 * @property text The text context for the operation. For insert operations, this is the line to insert; for delete
 *                operations, this is the line to delete; for modifications this is the original text.
 * @property newText The updated text for modifications. Only set if op is LineOp.Modified.
 */
export interface ILineDiff {
  op: LineOp;
  text: string;
  newText: string; // Only set if op is LineOp.Modified
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
 * @property contentsID A unique ID that can be used to retrieve the file contents. The ID is in the format
 *                      <SOURCE_PLATFORM>:<CONTENTS_URL_HASH>.
 * @property path The relative path (from the root of the repo) to the file that was updated in the patch.
 * @property op The operation that was done on the file in the patch.
 * @property diff The list of diffs, organized into hunks.
 */
export interface IPatch {
  contentsID: string;
  path: string;
  op: PatchOp;
  additions: number;
  deletions: number;
  diff: IHunk[];
}

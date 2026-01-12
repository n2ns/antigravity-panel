import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as workspaceId from "../../shared/utils/workspace_id";

suite("Workspace ID Utilities Test Suite", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test("normalizeUnixPath should normalize linux paths correctly", () => {
    assert.strictEqual(
      workspaceId.normalizeUnixPath("/home/user/project"),
      "file_home_user_project",
    );
    assert.strictEqual(
      workspaceId.normalizeUnixPath("/var/www/html"),
      "file_var_www_html",
    );
  });

  test("normalizeUnixPath should handle special characters", () => {
    assert.strictEqual(
      workspaceId.normalizeUnixPath("/home/user/my-project"),
      "file_home_user_my_project",
    );
    assert.strictEqual(
      workspaceId.normalizeUnixPath("/home/user/my.project"),
      "file_home_user_my_project",
    );
  });

  test("normalizeWindowsPath should normalize windows paths correctly", () => {
    assert.strictEqual(
      workspaceId.normalizeWindowsPath("C:\\Users\\User\\Project"),
      "file_c_3A_Users_User_Project",
    );
    assert.strictEqual(
      workspaceId.normalizeWindowsPath("D:\\Data"),
      "file_d_3A_Data",
    );
  });

  test("normalizeWindowsPath should handle lowercase drive letters", () => {
    assert.strictEqual(
      workspaceId.normalizeWindowsPath("c:\\Users"),
      "file_c_3A_Users",
    );
  });

  test("normalizeWindowsPath should convert special characters to underscores (matching server behavior)", () => {
    // Hyphens become underscores (server behavior)
    assert.strictEqual(
      workspaceId.normalizeWindowsPath("C:\\My-Project"),
      "file_c_3A_My_Project",
    );
  });

  test("normalizeWindowsPath should convert dots and hyphens to underscores (Fix for server mismatch)", () => {
    // Dots become underscores (server behavior)
    assert.strictEqual(
      workspaceId.normalizeWindowsPath("C:\\My.Project.v2"),
      "file_c_3A_My_Project_v2",
    );
    // Mixed: both dots and hyphens become underscores
    assert.strictEqual(
      workspaceId.normalizeWindowsPath("D:\\Dev-Space\\node.js-app"),
      "file_d_3A_Dev_Space_node_js_app",
    );
    // Underscores stay, dots become underscores
    assert.strictEqual(
      workspaceId.normalizeWindowsPath("E:\\My_Project.dir"),
      "file_e_3A_My_Project_dir",
    );
  });

  test("normalizeWindowsPath should fallback to unix normalization for non-drive paths", () => {
    assert.strictEqual(
      workspaceId.normalizeWindowsPath("\\\\server\\share"),
      "file_server_share",
    );
  });

  test("getWorkspaceIdsFromFolders should return empty array when no folders", () => {
    assert.deepStrictEqual(workspaceId.getWorkspaceIdsFromFolders([]), []);
  });

  test("getWorkspaceIdsFromFolders should return normalized IDs for open folders", () => {
    const mockFolders = [
      { uri: { fsPath: "/home/user/p1" }, index: 0, name: "p1" },
      { uri: { fsPath: "/home/user/p2" }, index: 1, name: "p2" },
    ];

    // Force platform to linux for this test
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux" });

    try {
      // @ts-ignore: mock object
      const ids = workspaceId.getWorkspaceIdsFromFolders(mockFolders);
      assert.strictEqual(ids.length, 2);
      assert.strictEqual(ids[0], "file_home_user_p1");
      assert.strictEqual(ids[1], "file_home_user_p2");
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });
});

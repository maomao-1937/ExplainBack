import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionForm } from "@/components/session-form";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const validSource =
  "RAG 会先检索与问题相关的外部资料，再把检索结果放入模型上下文，让模型基于这些资料生成答案。".repeat(
    3,
  );

describe("SessionForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
  });

  it("显示字段级错误，不发送非法输入", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<SessionForm />);

    await userEvent.type(screen.getByLabelText("学习主题"), "A");
    await userEvent.type(screen.getByLabelText("学习资料"), "太短");
    await userEvent.click(screen.getByRole("button", { name: "生成学习地图" }));

    expect(screen.getByText("主题至少需要 2 个字符")).toBeInTheDocument();
    expect(screen.getByText("学习资料至少需要 100 个字符")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("请求期间禁用按钮并展示生成状态", async () => {
    let resolveResponse!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    );
    render(<SessionForm />);
    await fillValidForm();

    await userEvent.click(screen.getByRole("button", { name: "生成学习地图" }));

    expect(screen.getByRole("button", { name: "正在拆解知识点…" })).toBeDisabled();
    resolveResponse(
      Response.json({ data: { id: "session-1" } }, { status: 201 }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sessions/session-1"));
  });

  it("API 错误时保留输入并显示可读提示", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: { code: "INTERNAL_ERROR", message: "服务暂时不可用" } },
        { status: 500 },
      ),
    );
    render(<SessionForm />);
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: "生成学习地图" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("服务暂时不可用");
    expect(screen.getByLabelText("学习主题")).toHaveValue("RAG 入门");
    expect(screen.getByLabelText("学习资料")).toHaveValue(validSource);
  });

  it("成功后跳转到同一个 Session 的学习地图", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ data: { id: "session-ready" } }, { status: 201 }),
    );
    render(<SessionForm />);
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: "生成学习地图" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/sessions/session-ready"),
    );
  });
});

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText("学习主题"), "RAG 入门");
  await userEvent.type(screen.getByLabelText("学习资料"), validSource);
}


import { SessionForm } from "@/components/session-form";

export default function NewSessionPage() {
  return (
    <main className="page-wrap" id="main-content">
      <header className="page-intro">
        <span className="eyebrow">New learning session</span>
        <h1>今天想把什么讲明白？</h1>
        <p>
          放入一份你刚读过的资料。我们先拆成学习地图，再从第一个知识点开始听你解释。
        </p>
      </header>
      <SessionForm />
    </main>
  );
}


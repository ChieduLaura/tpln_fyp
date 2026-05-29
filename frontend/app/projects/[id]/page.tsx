import ProjectWorkspace from "../../../components/ProjectWorkspace";
import Link from "next/link";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-[#09090b]">
      <div className="border-b border-zinc-900 bg-zinc-950/90 px-6 py-3 text-sm text-zinc-300">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <div className="text-zinc-400">Project workspace</div>
          <Link
            href={`/projects/${id}/planning`}
            className="rounded-full border border-orange-500/40 px-4 py-2 font-medium text-orange-300 transition hover:bg-orange-500/10"
          >
            Open AI Planning
          </Link>
        </div>
      </div>
      <ProjectWorkspace projectId={id} />
    </div>
  );
}


import { SkeletonPageHead } from "@/components/app/page-head";
import { Bone, SkeletonPage, TextBone } from "@/components/app/skeletons";

/**
 * A thread (`page.tsx`, chat/chat-panel.tsx ChatWorkspace) while it loads: the header (breadcrumb, no tabs), then in the
 * 760px column the question heading, the Answer / Sources / Steps tabs, "Hoot answered at …" and the answer's lines,
 * with the follow-up pill floating at the bottom. Same classes as the page, so it lands without moving.
 */
export function ThreadSkeleton() {
  return (
    <SkeletonPage fullBleed className="flex h-dvh min-h-0 flex-col">
      <SkeletonPageHead />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex w-full max-w-[840px] flex-col px-10 pt-[34px]">
          <TextBone className="text-display font-medium" w="w-[32rem]" />
          <div className="mt-[18px] flex min-h-9 items-center gap-5 border-b">
            {["w-12", "w-16", "w-14"].map((w, i) => (
              <Bone key={i} className={`h-3 rounded-[4px] ${w}`} />
            ))}
          </div>
          <div className="flex items-center gap-2 pt-[26px]">
            <Bone className="size-[22px] rounded-full" />
            <TextBone className="text-body" w="w-44" />
          </div>
          <div className="mt-2.5">
            {["w-full", "w-full", "w-11/12", "w-full", "w-full", "w-3/5"].map((w, i) => (
              <TextBone key={i} className="hoot-prose leading-7" w={w} />
            ))}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-10">
          <div className="flex min-h-14 w-[760px] max-w-full items-center rounded-[28px] border bg-surface py-2.5 pr-2.5 pl-5">
            <TextBone className="flex-1 text-emph" w="w-32" />
            <Bone className="size-9 rounded-full" />
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}

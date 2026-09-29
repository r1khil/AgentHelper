import { Bone, SkeletonPage, TextBone } from "@/components/app/skeletons";

/**
 * Home (`today-view.tsx`) while it loads: the market line in the top corner, Hoot's face, the greeting and, for readers
 * who see a book (the role the shell sets on <main>), the sentence under it; then the ask card with its control row and
 * the three questions about today, and the caption under it. Same classes as the page, so it lands without moving.
 */
export function HomeSkeleton() {
  return (
    <SkeletonPage>
      <div className="-mx-10 -mt-8 flex h-14 items-center justify-end px-5">
        <Bone className="h-3 w-72 rounded-[4px]" />
      </div>
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center pt-[70px] pb-16">
        <Bone className="size-14 rounded-full" />
        <TextBone className="mt-[18px] text-hero" w="w-[26rem]" />
        <TextBone className="mt-2.5 hidden min-h-6 text-emph in-data-[role=admin]:block in-data-[role=exec]:block in-data-[role^=lead]:block" w="w-[24rem]" />
        <div className="mt-8 w-full overflow-hidden rounded-2xl border bg-surface">
          <div className="h-[64px]" />
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-3">
            <Bone className="h-[30px] w-28 rounded-lg" />
            <TextBone className="pl-1 text-caption" w="w-64" />
            <span className="flex-1" />
            <Bone className="size-9 rounded-full" />
          </div>
          <div className="border-t py-1.5">
            <TextBone className="px-5 pt-2.5 pb-1 text-caption" w="w-24" />
            {["w-80", "w-72", "w-96"].map((w, i) => (
              <div key={i} className="flex min-h-11 items-center gap-3.5 px-5 py-2">
                <Bone className="size-4 rounded-full" />
                <TextBone className="text-emph" w={w} />
              </div>
            ))}
          </div>
        </div>
        <TextBone className="mt-3 text-caption" w="w-96" />
      </div>
    </SkeletonPage>
  );
}

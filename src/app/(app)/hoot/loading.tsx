import { SkeletonPageHead } from "@/components/app/page-head";
import { Bone, SkeletonPage, TextBone } from "@/components/app/skeletons";

/** All threads (`page.tsx`, thread-list.tsx) while they load: the header, the filter and the rows, in the 760px column. */
export default function Loading() {
  return (
    <>
      <SkeletonPageHead />
      <SkeletonPage>
        <div className="mx-auto flex w-full max-w-[760px] flex-col pt-2">
          <div className="flex h-9 items-center gap-2 border-b border-border-strong">
            <Bone className="size-3.5 rounded-full" />
            <TextBone className="text-body" w="w-24" />
          </div>
          {["w-80", "w-96", "w-72", "w-[28rem]", "w-64", "w-80", "w-96", "w-72"].map((w, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-row py-2.5">
              <Bone className="size-5 rounded-[5px]" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <TextBone className="text-body" w={w} />
                <TextBone className="text-caption" w="w-48" />
              </span>
              <Bone className="h-3 w-14 rounded-[4px]" />
            </div>
          ))}
        </div>
      </SkeletonPage>
    </>
  );
}

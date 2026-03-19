"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VesselsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/brochures"); }, [router]);
  return null;
}

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import db from "../db.server";
import { requireAppProxy } from "../services/app-proxy.server";
import { apiError, cleanText, json, publicId, readJson } from "../services/http.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireAppProxy(request);
  const productId = cleanText(new URL(request.url).searchParams.get("product_id"), 128);
  if (!productId) return apiError(400, "missing_product_id", "A product ID is required.");

  const reviews = await db.review.findMany({
    where: { shop, productId, status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      publicId: true,
      rating: true,
      title: true,
      body: true,
      authorName: true,
      verified: true,
      createdAt: true,
    },
  });
  const average = reviews.length
    ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10) / 10
    : 0;
  return json({ summary: { count: reviews.length, average }, reviews });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return apiError(405, "method_not_allowed", "Use POST to submit a review.");
  }

  const { shop } = await requireAppProxy(request);
  const payload = await readJson(request);
  const productId = cleanText(payload.productId, 128);
  const rating = Number(payload.rating);
  const body = cleanText(payload.body, 2_000);
  const title = cleanText(payload.title, 120) || undefined;
  const authorName = cleanText(payload.authorName, 80) || undefined;

  if (!productId || !Number.isInteger(rating) || rating < 1 || rating > 5 || body.length < 3) {
    return apiError(422, "invalid_review", "Product, rating from 1 to 5, and review text are required.");
  }

  const review = await db.review.create({
    data: {
      publicId: publicId("review"),
      shop,
      productId,
      rating,
      title,
      body,
      authorName,
      status: "PENDING",
      verified: false,
    },
    select: { publicId: true, status: true, createdAt: true },
  });
  return json({ review }, { status: 202 });
}

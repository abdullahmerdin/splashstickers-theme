import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Splash Stickers production workspace</h1>
        <p className={styles.text}>
          Save customer designs, generate mockups, moderate reviews and hand
          approved artwork to production.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Durable designs</strong>. Keep a versioned manifest outside
            the cart while the theme carries only a compact reference.
          </li>
          <li>
            <strong>Mockup workflow</strong>. Queue generation and expose a safe
            storefront status endpoint.
          </li>
          <li>
            <strong>Review moderation</strong>. Publish customer reviews only
            after merchant approval.
          </li>
        </ul>
      </div>
    </div>
  );
}

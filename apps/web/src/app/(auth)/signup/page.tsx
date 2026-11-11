import { redirect } from "next/navigation";

// Sign up is a popup of the public site: this address opens it.
export default function SignupPage() {
  redirect("/?auth=signup");
}

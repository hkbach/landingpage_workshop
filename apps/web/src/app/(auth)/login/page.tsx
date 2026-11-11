import { redirect } from "next/navigation";

// Log in is a popup of the public site: this address opens it (it is also where the links of the emails and Log out lead).
export default function LoginPage() {
  redirect("/?auth=login");
}

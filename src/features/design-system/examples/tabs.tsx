"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Example } from "@/features/design-system/components/docs/example";

const CANVAS = "flex-col items-stretch";

export function TabsExamples() {
  const [section, setSection] = useState("creators");
  const [view, setView] = useState("offers");

  return (
    <>
      <Example
        title="Tabs"
        description="Click to switch. The blue indicator slides to the selected tab."
        canvasClassName={CANVAS}
        code={`const [value, setValue] = useState("creators");

<Tabs value={value} onValueChange={setValue}>
  <TabsList>
    <TabsTrigger value="creators">Creators</TabsTrigger>
    <TabsTrigger value="seats">Company Seats</TabsTrigger>
    <TabsTrigger value="admin">Tomoji Admin</TabsTrigger>
  </TabsList>
</Tabs>`}
      >
        <Tabs value={section} onValueChange={setSection}>
          <TabsList>
            <TabsTrigger value="creators">Creators</TabsTrigger>
            <TabsTrigger value="seats">Company Seats</TabsTrigger>
            <TabsTrigger value="admin">Tomoji Admin</TabsTrigger>
          </TabsList>
        </Tabs>
      </Example>
      <Example
        title="With counts"
        canvasClassName={CANVAS}
        code={`<Tabs value={value} onValueChange={setValue}>
  <TabsList>
    <TabsTrigger value="applications">
      Applications <TabsCount>31</TabsCount>
    </TabsTrigger>
    <TabsTrigger value="offers">
      Offers <TabsCount>4</TabsCount>
    </TabsTrigger>
    <TabsTrigger value="archived">
      Archived <TabsCount>128</TabsCount>
    </TabsTrigger>
  </TabsList>
</Tabs>`}
      >
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="applications">
              Applications <TabsCount>31</TabsCount>
            </TabsTrigger>
            <TabsTrigger value="offers">
              Offers <TabsCount>4</TabsCount>
            </TabsTrigger>
            <TabsTrigger value="archived">
              Archived <TabsCount>128</TabsCount>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </Example>
      <Example
        title="Composed"
        description="Add a TabsContent panel per tab. Arrow keys, Home and End move between tabs; the panel follows the selection."
        canvasClassName={CANVAS}
        code={`<Tabs defaultValue="applications">
  <TabsList>
    <TabsTrigger value="applications">Applications</TabsTrigger>
    <TabsTrigger value="offers">Offers</TabsTrigger>
    <TabsTrigger value="archived">Archived</TabsTrigger>
  </TabsList>
  <TabsContent value="applications">Applications panel</TabsContent>
  <TabsContent value="offers">Offers panel</TabsContent>
  <TabsContent value="archived">Archived panel</TabsContent>
</Tabs>`}
      >
        <Tabs defaultValue="applications">
          <TabsList>
            <TabsTrigger value="applications">Applications</TabsTrigger>
            <TabsTrigger value="offers">Offers</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
          <TabsContent value="applications" className="text-body-sm text-gray-500">
            Applications panel
          </TabsContent>
          <TabsContent value="offers" className="text-body-sm text-gray-500">
            Offers panel
          </TabsContent>
          <TabsContent value="archived" className="text-body-sm text-gray-500">
            Archived panel
          </TabsContent>
        </Tabs>
      </Example>
    </>
  );
}

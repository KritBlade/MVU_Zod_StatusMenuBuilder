# How to use MVU Zod Status Menu Builder

The builder has 7 pages, in a top bar across the top. They sit in 4 groups: **Menu**, **Data**, **Export** and **Events**. Each page does one job.

| Group | Page | What it does | Doc |
| --- | --- | --- | --- |
| Menu | **Builder** | draw the status menu: tabs, blocks and cells, with a live preview | [The Builder page](builder.md) |
| Menu | **Templates** | the menu's look, its fixed text and your own list designs | [Templates](templates.md) |
| Data | **Data Configuration** | the sample data your menu is drawn from, and your project file | [Data Configuration](data.md) |
| Data | **Schema Output** | tick the variables your game keeps, and get its Zod schema | [Schema Output](schema.md) |
| Export | **Export HTML** | the whole menu as one HTML document, for a quick look or test | [Export your menu](export.md#export-html) |
| Export | **StatusMenu Pack** | export the menu as a pack MVU Helper installs | [Export your menu](export.md) |
| Events | **Event Pack** | build event packs for a game card | [Build events in MVU Status Menu Builder](https://github.com/KritBlade/mvu-helper/blob/main/doc/eventpack_engine/builder.md) |

## Save your work

The builder doesn't save anything on its own. Close the browser tab, and your work is gone.

So click **Export config** before you close it. It's in the **Config file** card, at the top of the Data Configuration page. It downloads `layout.json`, your project file. It holds everything: the layout, the sample data, the schema ticks, the templates, the CSS and the fixed text. Next time, **Import config** loads it back, and you carry on where you left off.

Import config replaces all of that, so it asks first.

Keep that file. It's the master copy of your menu. Don't mix it up with the `layout/layout.json` inside a pack. That one is written by the StatusMenu Pack page, and MVU Helper refuses it if it holds a formula. Your project file holds all your formulas.

## It asks before it replaces

Anything that replaces or deletes your work asks first, in a box inside the app. **Cancel** keeps your work as it is.

Once you confirm, there's no undo. So when you're not sure, Export config first.

## Where the data comes from

The builder never sees the game itself. It only sees the data you give it. So the first thing you need is the game's data, from whoever codes the game.

There are 2 easy ways to get it:

- **The game's own project file.** Import config it, and you get its data, its menu and its schema ticks in one go. ArtificKoi's is [sample-layout-schoolv4.json](https://github.com/KritBlade/mvu-helper/blob/mvu-helper-template/workspace/statusmenu/sample-layout-schoolv4.json), in the template workspace.
- **The card's `[InitVar]` entry.** It's the game's starting `stat_data`, as JSON. Paste it into the Data Configuration page.

The Event Pack page is the exception. It reads the game card file itself, so it needs none of the other pages.

## The order

For a status menu:

1. **Data Configuration.** Put in the game's data.
2. **Schema Output.** Turn on **Collection** for every list of members, like the cast or the inventory. The Builder page uses it.
3. **Builder.** Draw the menu.
4. **Templates.** Change the look, if you want to.
5. **StatusMenu Pack.** Export it.
6. **Export config.** Save your project file.

For a schema only, steps 1 and 2 are enough. Copy the code from Schema Output.

For events, go straight to the Event Pack page and upload the card.

Basically, the data goes in first, and everything else is built on top of it.

[Back to README](../README.md)

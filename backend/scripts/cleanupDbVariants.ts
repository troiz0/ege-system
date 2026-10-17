import { prisma } from '../src/lib/prisma';
import { sanitizeMathText } from '../src/lib/mathSanitizer';

async function main() {
  console.log('Starting DB variants sanitization...');
  const variants = await prisma.examVariantCache.findMany();
  console.log(`Found ${variants.length} cached variants.`);

  let updatedCount = 0;
  for (const v of variants) {
    try {
      const data = JSON.parse(v.dataJson);
      let changed = false;

      if (Array.isArray(data.tasks)) {
        for (const task of data.tasks) {
          if (task.statement) {
            const sanitized = sanitizeMathText(task.statement);
            if (sanitized !== task.statement) {
              task.statement = sanitized;
              changed = true;
            }
          }
          if (task.solution) {
            const sanitizedSol = sanitizeMathText(task.solution);
            if (sanitizedSol !== task.solution) {
              task.solution = sanitizedSol;
              changed = true;
            }
          }
        }
      }

      if (changed) {
        await prisma.examVariantCache.update({
          where: { id: v.id },
          data: { dataJson: JSON.stringify(data) },
        });
        updatedCount++;
        console.log(`Updated variant ${v.id} (variantNumber: ${v.variantNumber})`);
      }
    } catch (err) {
      console.error(`Error processing variant ${v.id}:`, err);
    }
  }

  // Also check AssignedWork
  const assignedWorks = await prisma.assignedWork.findMany();
  let assignedCount = 0;
  for (const w of assignedWorks) {
    try {
      if (w.variantData) {
        const data = JSON.parse(w.variantData);
        let changed = false;
        if (Array.isArray(data.tasks)) {
          for (const task of data.tasks) {
            if (task.statement) {
              const sanitized = sanitizeMathText(task.statement);
              if (sanitized !== task.statement) {
                task.statement = sanitized;
                changed = true;
              }
            }
            if (task.solution) {
              const sanitizedSol = sanitizeMathText(task.solution);
              if (sanitizedSol !== task.solution) {
                task.solution = sanitizedSol;
                changed = true;
              }
            }
          }
        }
        if (changed) {
          await prisma.assignedWork.update({
            where: { id: w.id },
            data: { variantData: JSON.stringify(data) },
          });
          assignedCount++;
        }
      }
    } catch (err) {
      console.error(`Error processing assignedWork ${w.id}:`, err);
    }
  }

  console.log(`Finished: ${updatedCount} cached variants updated, ${assignedCount} assigned works updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
